'use strict';

var obsidian = require('obsidian');

const DEFAULT_WEEK_FORMAT = "gggg-[W]ww";
const DEFAULT_WORDS_PER_DOT = 250;
const VIEW_TYPE_CALENDAR = "calendar";
const TRIGGER_ON_OPEN = "calendar:open";

//#region src/constants.ts
const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
//#endregion
//#region src/settings.ts
function validateString(value) {
	return typeof value === "string" ? value : "";
}
function shouldUsePeriodicNotesSettings(periodicity) {
	return !!window.app.plugins.getPlugin("periodic-notes")?.settings?.[periodicity]?.enabled;
}
/**
* Read the user settings for the `daily-notes` plugin
* to keep behavior of creating a new note in-sync.
*/
function getDailyNoteSettings() {
	try {
		const { internalPlugins, plugins } = window.app;
		if (shouldUsePeriodicNotesSettings("daily")) {
			const { format, folder, template } = plugins.getPlugin("periodic-notes")?.settings?.daily || {};
			return {
				format: format || "YYYY-MM-DD",
				folder: validateString(folder).trim(),
				template: validateString(template).trim()
			};
		}
		const { folder, format, template } = internalPlugins.getPluginById("daily-notes")?.instance?.options || {};
		return {
			format: format || "YYYY-MM-DD",
			folder: validateString(folder).trim(),
			template: validateString(template).trim()
		};
	} catch (err) {
		console.info("No custom daily note settings found!", err);
	}
}
/**
* Read the user settings for the `weekly-notes` plugin
* to keep behavior of creating a new note in-sync.
*/
function getWeeklyNoteSettings() {
	try {
		const pluginManager = window.app.plugins;
		const calendarSettings = pluginManager.getPlugin("calendar")?.options;
		const periodicNotesSettings = pluginManager.getPlugin("periodic-notes")?.settings?.weekly;
		if (shouldUsePeriodicNotesSettings("weekly") && periodicNotesSettings) return {
			format: periodicNotesSettings.format || "gggg-[W]ww",
			folder: validateString(periodicNotesSettings.folder).trim(),
			template: validateString(periodicNotesSettings.template).trim()
		};
		const settings = calendarSettings || {};
		return {
			format: settings.weeklyNoteFormat || "gggg-[W]ww",
			folder: validateString(settings.weeklyNoteFolder).trim(),
			template: validateString(settings.weeklyNoteTemplate).trim()
		};
	} catch (err) {
		console.info("No custom weekly note settings found!", err);
	}
}
/**
* Read the user settings for the `periodic-notes` plugin
* to keep behavior of creating a new note in-sync.
*/
function getMonthlyNoteSettings() {
	const pluginManager = window.app.plugins;
	try {
		const settings = shouldUsePeriodicNotesSettings("monthly") && pluginManager.getPlugin("periodic-notes")?.settings?.monthly || {};
		return {
			format: settings.format || "YYYY-MM",
			folder: validateString(settings.folder).trim(),
			template: validateString(settings.template).trim()
		};
	} catch (err) {
		console.info("No custom monthly note settings found!", err);
	}
}
/**
* Read the user settings for the `periodic-notes` plugin
* to keep behavior of creating a new note in-sync.
*/
function getQuarterlyNoteSettings() {
	const pluginManager = window.app.plugins;
	try {
		const settings = shouldUsePeriodicNotesSettings("quarterly") && pluginManager.getPlugin("periodic-notes")?.settings?.quarterly || {};
		return {
			format: settings.format || "YYYY-[Q]Q",
			folder: validateString(settings.folder).trim(),
			template: validateString(settings.template).trim()
		};
	} catch (err) {
		console.info("No custom quarterly note settings found!", err);
	}
}
/**
* Read the user settings for the `periodic-notes` plugin
* to keep behavior of creating a new note in-sync.
*/
function getYearlyNoteSettings() {
	const pluginManager = window.app.plugins;
	try {
		const settings = shouldUsePeriodicNotesSettings("yearly") && pluginManager.getPlugin("periodic-notes")?.settings?.yearly || {};
		return {
			format: settings.format || "YYYY",
			folder: validateString(settings.folder).trim(),
			template: validateString(settings.template).trim()
		};
	} catch (err) {
		console.info("No custom yearly note settings found!", err);
	}
}
//#endregion
//#region src/vault.ts
function join(...partSegments) {
	let parts = [];
	for (let i = 0, l = partSegments.length; i < l; i++) parts = parts.concat(partSegments[i].split("/"));
	const newParts = [];
	for (let i = 0, l = parts.length; i < l; i++) {
		const part = parts[i];
		if (!part || part === ".") continue;
		else newParts.push(part);
	}
	if (parts[0] === "") newParts.unshift("");
	return newParts.join("/");
}
async function ensureFolderExists(path) {
	const dirs = path.replace(/\\/g, "/").split("/");
	dirs.pop();
	if (dirs.length) {
		const dir = join(...dirs);
		if (!window.app.vault.getAbstractFileByPath(dir)) await window.app.vault.createFolder(dir);
	}
}
async function getNotePath$1(directory, filename) {
	if (!filename.endsWith(".md")) filename += ".md";
	const path = obsidian.normalizePath(join(directory, filename));
	await ensureFolderExists(path);
	return path;
}
async function getTemplateInfo(template) {
	const { metadataCache, vault } = window.app;
	const templatePath = obsidian.normalizePath(template);
	if (templatePath === "/") return ["", null];
	try {
		const templateFile = metadataCache.getFirstLinkpathDest(templatePath, "");
		return [await vault.cachedRead(templateFile), window.app.foldManager.load(templateFile)];
	} catch (err) {
		console.error(`Failed to read the daily note template '${templatePath}'`, err);
		new obsidian.Notice("Failed to read the daily note template");
		return ["", null];
	}
}
//#endregion
//#region src/parse.ts
/**
* dateUID is a way of weekly identifying daily/weekly/monthly notes.
* They are prefixed with the granularity to avoid ambiguity.
*/
function getDateUID(date, granularity = "day") {
	return `${granularity}-${date.clone().startOf(granularity).format()}`;
}
/**
* This function mimics the behavior of the daily-notes plugin
* so it will replace {{date}}, {{title}}, and {{time}} with the
* formatted timestamp.
*
* Note: it has an added bonus that it's not 'today' specific.
*/
async function createDailyNote(date) {
	const { app } = window;
	const { vault } = app;
	const moment = window.moment;
	const { template = "", format = "", folder = "" } = getDailyNoteSettings() ?? {};
	const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	const filename = date.format(format);
	const normalizedPath = await getNotePath$1(folder, filename);
	try {
		const createdFile = await vault.create(normalizedPath, templateContents.replace(/{{\s*date\s*}}/gi, filename).replace(/{{\s*time\s*}}/gi, moment().format("HH:mm")).replace(/{{\s*title\s*}}/gi, filename).replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
			const now = moment();
			const currentDate = date.clone().set({
				hour: now.get("hour"),
				minute: now.get("minute"),
				second: now.get("second")
			});
			if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
			if (momentFormat) return currentDate.format(momentFormat.substring(1).trim());
			return currentDate.format(format);
		}).replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(format)).replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "d").format(format)));
		app.foldManager.save(createdFile, IFoldInfo);
		return createdFile;
	} catch (err) {
		console.error(`Failed to create file: '${normalizedPath}'`, err);
		new obsidian.Notice("Unable to create new file.");
	}
}
function getDaysOfWeek$1() {
	const { moment } = window;
	let weekStart = moment.localeData().firstDayOfWeek();
	const daysOfWeek = [
		"sunday",
		"monday",
		"tuesday",
		"wednesday",
		"thursday",
		"friday",
		"saturday"
	];
	while (weekStart) {
		daysOfWeek.push(daysOfWeek.shift());
		weekStart--;
	}
	return daysOfWeek;
}
function getDayOfWeekNumericalValue(dayOfWeekName) {
	return getDaysOfWeek$1().indexOf(dayOfWeekName.toLowerCase());
}
async function createWeeklyNote(date) {
	const { vault } = window.app;
	const { template = "", format = "", folder = "" } = getWeeklyNoteSettings() ?? {};
	const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	const filename = date.format(format);
	const normalizedPath = await getNotePath$1(folder, filename);
	try {
		const createdFile = await vault.create(normalizedPath, templateContents.replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
			const now = window.moment();
			const currentDate = date.clone().set({
				hour: now.get("hour"),
				minute: now.get("minute"),
				second: now.get("second")
			});
			if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
			if (momentFormat) return currentDate.format(momentFormat.substring(1).trim());
			return currentDate.format(format);
		}).replace(/{{\s*title\s*}}/gi, filename).replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm")).replace(/{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi, (_, dayOfWeek, momentFormat) => {
			const day = getDayOfWeekNumericalValue(dayOfWeek);
			return date.weekday(day).format(momentFormat.trim());
		}));
		window.app.foldManager.save(createdFile, IFoldInfo);
		return createdFile;
	} catch (err) {
		console.error(`Failed to create file: '${normalizedPath}'`, err);
		new obsidian.Notice("Unable to create new file.");
	}
}
/**
* This function mimics the behavior of the daily-notes plugin
* so it will replace {{date}}, {{title}}, and {{time}} with the
* formatted timestamp.
*
* Note: it has an added bonus that it's not 'today' specific.
*/
async function createMonthlyNote(date) {
	const { vault } = window.app;
	const { template = "", format = "", folder = "" } = getMonthlyNoteSettings() ?? {};
	const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	const filename = date.format(format);
	const normalizedPath = await getNotePath$1(folder, filename);
	try {
		const createdFile = await vault.create(normalizedPath, templateContents.replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
			const now = window.moment();
			const currentDate = date.clone().set({
				hour: now.get("hour"),
				minute: now.get("minute"),
				second: now.get("second")
			});
			if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
			if (momentFormat) return currentDate.format(momentFormat.substring(1).trim());
			return currentDate.format(format);
		}).replace(/{{\s*date\s*}}/gi, filename).replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm")).replace(/{{\s*title\s*}}/gi, filename));
		window.app.foldManager.save(createdFile, IFoldInfo);
		return createdFile;
	} catch (err) {
		console.error(`Failed to create file: '${normalizedPath}'`, err);
		new obsidian.Notice("Unable to create new file.");
	}
}
/**
* This function mimics the behavior of the daily-notes plugin
* so it will replace {{date}}, {{title}}, and {{time}} with the
* formatted timestamp.
*
* Note: it has an added bonus that it's not 'today' specific.
*/
async function createQuarterlyNote(date) {
	const { vault } = window.app;
	const { template = "", format = "", folder = "" } = getQuarterlyNoteSettings() ?? {};
	const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	const filename = date.format(format);
	const normalizedPath = await getNotePath$1(folder, filename);
	try {
		const createdFile = await vault.create(normalizedPath, templateContents.replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
			const now = window.moment();
			const currentDate = date.clone().set({
				hour: now.get("hour"),
				minute: now.get("minute"),
				second: now.get("second")
			});
			if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
			if (momentFormat) return currentDate.format(momentFormat.substring(1).trim());
			return currentDate.format(format);
		}).replace(/{{\s*date\s*}}/gi, filename).replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm")).replace(/{{\s*title\s*}}/gi, filename));
		window.app.foldManager.save(createdFile, IFoldInfo);
		return createdFile;
	} catch (err) {
		console.error(`Failed to create file: '${normalizedPath}'`, err);
		new obsidian.Notice("Unable to create new file.");
	}
}
/**
* This function mimics the behavior of the daily-notes plugin
* so it will replace {{date}}, {{title}}, and {{time}} with the
* formatted timestamp.
*
* Note: it has an added bonus that it's not 'today' specific.
*/
async function createYearlyNote(date) {
	const { vault } = window.app;
	const { template = "", format = "", folder = "" } = getYearlyNoteSettings() ?? {};
	const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	const filename = date.format(format);
	const normalizedPath = await getNotePath$1(folder, filename);
	try {
		const createdFile = await vault.create(normalizedPath, templateContents.replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
			const now = window.moment();
			const currentDate = date.clone().set({
				hour: now.get("hour"),
				minute: now.get("minute"),
				second: now.get("second")
			});
			if (calc) currentDate.add(parseInt(timeDelta, 10), unit);
			if (momentFormat) return currentDate.format(momentFormat.substring(1).trim());
			return currentDate.format(format);
		}).replace(/{{\s*date\s*}}/gi, filename).replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm")).replace(/{{\s*title\s*}}/gi, filename));
		window.app.foldManager.save(createdFile, IFoldInfo);
		return createdFile;
	} catch (err) {
		console.error(`Failed to create file: '${normalizedPath}'`, err);
		new obsidian.Notice("Unable to create new file.");
	}
}
//#endregion
//#region src/index.ts
function appHasDailyNotesPluginLoaded() {
	const { app } = window;
	const dailyNotesPlugin = app.internalPlugins.plugins["daily-notes"];
	if (dailyNotesPlugin && dailyNotesPlugin.enabled) return true;
	return !!app.plugins.getPlugin("periodic-notes")?.settings?.daily?.enabled;
}
function getPeriodicNoteSettings(granularity) {
	const getSettings = {
		day: getDailyNoteSettings,
		week: getWeeklyNoteSettings,
		month: getMonthlyNoteSettings,
		quarter: getQuarterlyNoteSettings,
		year: getYearlyNoteSettings
	}[granularity];
	return getSettings();
}
function createPeriodicNote(granularity, date) {
	return {
		day: createDailyNote,
		week: createWeeklyNote,
		month: createMonthlyNote,
		quarter: createQuarterlyNote,
		year: createYearlyNote
	}[granularity](date);
}

function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
// Adapted from https://github.com/then/is-promise/blob/master/index.js
// Distributed under MIT License https://github.com/then/is-promise/blob/master/LICENSE
function is_promise(value) {
    return !!value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function';
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function not_equal(a, b) {
    return a != a ? b == b : a !== b;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function subscribe(store, ...callbacks) {
    if (store == null) {
        return noop;
    }
    const unsub = store.subscribe(...callbacks);
    return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}
function get_store_value(store) {
    let value;
    subscribe(store, _ => value = _)();
    return value;
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
        const dirty = [];
        const length = $$scope.ctx.length / 32;
        for (let i = 0; i < length; i++) {
            dirty[i] = -1;
        }
        return dirty;
    }
    return -1;
}
function null_to_empty(value) {
    return value == null ? '' : value;
}
const contenteditable_truthy_values = ['', true, 1, 'true', 'contenteditable'];

const globals = (typeof window !== 'undefined'
    ? window
    : typeof globalThis !== 'undefined'
        ? globalThis
        : global);
function append(target, node) {
    target.appendChild(node);
}
function append_styles(target, style_sheet_id, styles) {
    const append_styles_to = get_root_for_style(target);
    if (!append_styles_to.getElementById(style_sheet_id)) {
        const style = element('style');
        style.id = style_sheet_id;
        style.textContent = styles;
        append_stylesheet(append_styles_to, style);
    }
}
function get_root_for_style(node) {
    if (!node)
        return document;
    const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
    if (root && root.host) {
        return root;
    }
    return node.ownerDocument;
}
function append_stylesheet(node, style) {
    append(node.head || node, style);
    return style.sheet;
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
/**
 * List of attributes that should always be set through the attr method,
 * because updating them through the property setter doesn't work reliably.
 * In the example of `width`/`height`, the problem is that the setter only
 * accepts numeric values, but the attribute can also be set to a string like `50%`.
 * If this list becomes too big, rethink this approach.
 */
const always_set_through_set_attribute = ['width', 'height'];
function set_attributes(node, attributes) {
    // @ts-ignore
    const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
    for (const key in attributes) {
        if (attributes[key] == null) {
            node.removeAttribute(key);
        }
        else if (key === 'style') {
            node.style.cssText = attributes[key];
        }
        else if (key === '__value') {
            node.value = node[key] = attributes[key];
        }
        else if (descriptors[key] && descriptors[key].set && always_set_through_set_attribute.indexOf(key) === -1) {
            node[key] = attributes[key];
        }
        else {
            attr(node, key, attributes[key]);
        }
    }
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_data_contenteditable(text, data) {
    data = '' + data;
    if (text.wholeText === data)
        return;
    text.data = data;
}
function set_data_maybe_contenteditable(text, data, attr_value) {
    if (~contenteditable_truthy_values.indexOf(attr_value)) {
        set_data_contenteditable(text, data);
    }
    else {
        set_data(text, data);
    }
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * Schedules a callback to run immediately after the component has been updated.
 *
 * The first time the callback runs will be after the initial `onMount`
 */
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
/**
 * Schedules a callback to run immediately before the component is unmounted.
 *
 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
 * only one that runs inside a server-side component.
 *
 * https://svelte.dev/docs#run-time-svelte-ondestroy
 */
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
function add_flush_callback(fn) {
    flush_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}

function handle_promise(promise, info) {
    const token = info.token = {};
    function update(type, index, key, value) {
        if (info.token !== token)
            return;
        info.resolved = value;
        let child_ctx = info.ctx;
        if (key !== undefined) {
            child_ctx = child_ctx.slice();
            child_ctx[key] = value;
        }
        const block = type && (info.current = type)(child_ctx);
        let needs_flush = false;
        if (info.block) {
            if (info.blocks) {
                info.blocks.forEach((block, i) => {
                    if (i !== index && block) {
                        group_outros();
                        transition_out(block, 1, 1, () => {
                            if (info.blocks[i] === block) {
                                info.blocks[i] = null;
                            }
                        });
                        check_outros();
                    }
                });
            }
            else {
                info.block.d(1);
            }
            block.c();
            transition_in(block, 1);
            block.m(info.mount(), info.anchor);
            needs_flush = true;
        }
        info.block = block;
        if (info.blocks)
            info.blocks[index] = block;
        if (needs_flush) {
            flush();
        }
    }
    if (is_promise(promise)) {
        const current_component = get_current_component();
        promise.then(value => {
            set_current_component(current_component);
            update(info.then, 1, info.value, value);
            set_current_component(null);
        }, error => {
            set_current_component(current_component);
            update(info.catch, 2, info.error, error);
            set_current_component(null);
            if (!info.hasCatch) {
                throw error;
            }
        });
        // if we previously had a then/catch block, destroy it
        if (info.current !== info.pending) {
            update(info.pending, 0);
            return true;
        }
    }
    else {
        if (info.current !== info.then) {
            update(info.then, 1, info.value, promise);
            return true;
        }
        info.resolved = promise;
    }
}
function update_await_block_branch(info, ctx, dirty) {
    const child_ctx = ctx.slice();
    const { resolved } = info;
    if (info.current === info.then) {
        child_ctx[info.value] = resolved;
    }
    if (info.current === info.catch) {
        child_ctx[info.error] = resolved;
    }
    info.block.p(child_ctx, dirty);
}
function outro_and_destroy_block(block, lookup) {
    transition_out(block, 1, 1, () => {
        lookup.delete(block.key);
    });
}
function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
    let o = old_blocks.length;
    let n = list.length;
    let i = o;
    const old_indexes = {};
    while (i--)
        old_indexes[old_blocks[i].key] = i;
    const new_blocks = [];
    const new_lookup = new Map();
    const deltas = new Map();
    const updates = [];
    i = n;
    while (i--) {
        const child_ctx = get_context(ctx, list, i);
        const key = get_key(child_ctx);
        let block = lookup.get(key);
        if (!block) {
            block = create_each_block(key, child_ctx);
            block.c();
        }
        else {
            // defer updates until all the DOM shuffling is done
            updates.push(() => block.p(child_ctx, dirty));
        }
        new_lookup.set(key, new_blocks[i] = block);
        if (key in old_indexes)
            deltas.set(key, Math.abs(i - old_indexes[key]));
    }
    const will_move = new Set();
    const did_move = new Set();
    function insert(block) {
        transition_in(block, 1);
        block.m(node, next);
        lookup.set(block.key, block);
        next = block.first;
        n--;
    }
    while (o && n) {
        const new_block = new_blocks[n - 1];
        const old_block = old_blocks[o - 1];
        const new_key = new_block.key;
        const old_key = old_block.key;
        if (new_block === old_block) {
            // do nothing
            next = new_block.first;
            o--;
            n--;
        }
        else if (!new_lookup.has(old_key)) {
            // remove old block
            destroy(old_block, lookup);
            o--;
        }
        else if (!lookup.has(new_key) || will_move.has(new_key)) {
            insert(new_block);
        }
        else if (did_move.has(old_key)) {
            o--;
        }
        else if (deltas.get(new_key) > deltas.get(old_key)) {
            did_move.add(new_key);
            insert(new_block);
        }
        else {
            will_move.add(old_key);
            o--;
        }
    }
    while (o--) {
        const old_block = old_blocks[o];
        if (!new_lookup.has(old_block.key))
            destroy(old_block, lookup);
    }
    while (n)
        insert(new_blocks[n - 1]);
    run_all(updates);
    return new_blocks;
}

function get_spread_update(levels, updates) {
    const update = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
        const o = levels[i];
        const n = updates[i];
        if (n) {
            for (const key in o) {
                if (!(key in n))
                    to_null_out[key] = 1;
            }
            for (const key in n) {
                if (!accounted_for[key]) {
                    update[key] = n[key];
                    accounted_for[key] = 1;
                }
            }
            levels[i] = n;
        }
        else {
            for (const key in o) {
                accounted_for[key] = 1;
            }
        }
    }
    for (const key in to_null_out) {
        if (!(key in update))
            update[key] = undefined;
    }
    return update;
}
function get_spread_object(spread_props) {
    return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
}

function bind(component, name, callback) {
    const index = component.$$.props[name];
    if (index !== undefined) {
        component.$$.bound[index] = callback;
        callback(component.$$.ctx[index]);
    }
}
function create_component(block) {
    block && block.c();
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

const subscriber_queue = [];
/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 * @param {*=}value initial value
 * @param {StartStopNotifier=} start
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = new Set();
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (const subscriber of subscribers) {
                    subscriber[1]();
                    subscriber_queue.push(subscriber, value);
                }
                if (run_queue) {
                    for (let i = 0; i < subscriber_queue.length; i += 2) {
                        subscriber_queue[i][0](subscriber_queue[i + 1]);
                    }
                    subscriber_queue.length = 0;
                }
            }
        }
    }
    function update(fn) {
        set(fn(value));
    }
    function subscribe(run, invalidate = noop) {
        const subscriber = [run, invalidate];
        subscribers.add(subscriber);
        if (subscribers.size === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            subscribers.delete(subscriber);
            if (subscribers.size === 0 && stop) {
                stop();
                stop = null;
            }
        };
    }
    return { set, update, subscribe };
}

const weekdays$1 = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
const defaultSettings = Object.freeze({
    calendarView: "month",
    shouldConfirmBeforeCreate: true,
    weekStart: "locale",
    wordsPerDot: DEFAULT_WORDS_PER_DOT,
    weekdayLabelFormat: "ddd",
    showMonthlyNote: false,
    showQuarterlyNote: false,
    showYearlyNote: false,
    showWeeklyNote: false,
    weeklyNoteFormat: "",
    weeklyNoteTemplate: "",
    weeklyNoteFolder: "",
    showDateTags: true,
    useMetadataDates: false,
    metadataDateProperty: "date",
    metadataDateFormat: "YYYY-MM-DD",
    localeOverride: "system-default",
});
function appHasPeriodicNotesPluginLoaded(interval = "weekly") {
    var _a, _b;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodicNotes = window.app.plugins.getPlugin("periodic-notes");
    return Boolean((_b = (_a = periodicNotes === null || periodicNotes === void 0 ? void 0 : periodicNotes.settings) === null || _a === void 0 ? void 0 : _a[interval]) === null || _b === void 0 ? void 0 : _b.enabled);
}
class CalendarSettingsTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        this.containerEl.empty();
        if (!appHasDailyNotesPluginLoaded()) {
            this.containerEl.createDiv("settings-banner", (banner) => {
                banner.createEl("h3", {
                    text: "⚠️ Daily Notes plugin not enabled",
                });
                banner.createEl("p", {
                    cls: "setting-item-description",
                    text: "The calendar is best used in conjunction with either the Daily Notes plugin or the Periodic Notes plugin (available in the Community Plugins catalog).",
                });
            });
        }
        this.containerEl.createEl("h3", {
            text: "General Settings",
        });
        this.addDotThresholdSetting();
        this.addCalendarViewSetting();
        this.addWeekdayLabelFormatSetting();
        this.addWeekStartSetting();
        this.addConfirmCreateSetting();
        this.addShowWeeklyNoteSetting();
        this.addPeriodicHeaderSettings();
        this.addDateAssociationSettings();
        if (this.plugin.options.showWeeklyNote &&
            !appHasPeriodicNotesPluginLoaded()) {
            this.containerEl.createEl("h3", {
                text: "Weekly Note Settings",
            });
            this.containerEl.createEl("p", {
                cls: "setting-item-description",
                text: "Note: Weekly Note settings are moving. You are encouraged to install the 'Periodic Notes' plugin to keep the functionality in the future.",
            });
            this.addWeeklyNoteFormatSetting();
            this.addWeeklyNoteTemplateSetting();
            this.addWeeklyNoteFolderSetting();
        }
        this.containerEl.createEl("h3", {
            text: "Advanced Settings",
        });
        this.addLocaleOverrideSetting();
    }
    addDotThresholdSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Words per dot")
            .setDesc("How many words should be represented by a single dot?")
            .addText((textfield) => {
            textfield.setPlaceholder(String(DEFAULT_WORDS_PER_DOT));
            textfield.inputEl.type = "number";
            textfield.setValue(String(this.plugin.options.wordsPerDot));
            textfield.onChange(async (value) => {
                this.plugin.writeOptions(() => ({
                    wordsPerDot: value !== "" ? Number(value) : undefined,
                }));
            });
        });
    }
    addCalendarViewSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Calendar view")
            .setDesc("Choose whether Calendar opens as one month or a twelve-month year overview. Embedded calendars can override this in their code block.")
            .addDropdown((dropdown) => {
            dropdown.addOption("month", "Month");
            dropdown.addOption("year", "Year");
            dropdown.setValue(this.plugin.options.calendarView);
            dropdown.onChange(async (value) => {
                await this.plugin.writeOptions(() => ({
                    calendarView: value,
                }));
            });
        });
    }
    addWeekStartSetting() {
        var _a, _b;
        const { moment } = window;
        const localizedWeekdays = moment.weekdays();
        // `dow` can legitimately be 0 (Sunday), so use nullish fallback rather
        // than `|| 1`. Some locales do not populate Obsidian's bundled week spec.
        const localeWeekStartNum = (_b = (_a = window._bundledLocaleWeekSpec) === null || _a === void 0 ? void 0 : _a.dow) !== null && _b !== void 0 ? _b : 1;
        const localeWeekStart = moment.weekdays()[localeWeekStartNum];
        new obsidian.Setting(this.containerEl)
            .setName("Start week on:")
            .setDesc("Choose what day of the week to start. Select 'Locale default' to use the default specified by moment.js")
            .addDropdown((dropdown) => {
            dropdown.addOption("locale", `Locale default (${localeWeekStart})`);
            localizedWeekdays.forEach((day, i) => {
                dropdown.addOption(weekdays$1[i], day);
            });
            dropdown.setValue(this.plugin.options.weekStart);
            dropdown.onChange(async (value) => {
                this.plugin.writeOptions(() => ({
                    weekStart: value,
                }));
            });
        });
    }
    addConfirmCreateSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Confirm before creating new note")
            .setDesc("Show a confirmation modal before creating a new note")
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.options.shouldConfirmBeforeCreate);
            toggle.onChange(async (value) => {
                this.plugin.writeOptions(() => ({
                    shouldConfirmBeforeCreate: value,
                }));
            });
        });
    }
    addWeekdayLabelFormatSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Weekday label format")
            .setDesc("Weekday format: d for M (single letter), dd for Mo, or ddd for Mon.")
            .addText((textfield) => {
            textfield.setPlaceholder("ddd");
            textfield.setValue(this.plugin.options.weekdayLabelFormat || "ddd");
            textfield.onChange(async (value) => {
                await this.plugin.writeOptions(() => ({ weekdayLabelFormat: value.trim() || "ddd" }));
            });
        });
    }
    addShowWeeklyNoteSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Show week number")
            .setDesc("Enable this to add a column with the week number")
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.options.showWeeklyNote);
            toggle.onChange(async (value) => {
                this.plugin.writeOptions(() => ({ showWeeklyNote: value }));
                this.display(); // show/hide weekly settings
            });
        });
    }
    addPeriodicHeaderSettings() {
        this.containerEl.createEl("h3", { text: "Periodic Note Links" });
        this.addPeriodicHeaderSetting("showMonthlyNote", "Open monthly note from calendar header", "Make the displayed month clickable. Requires Monthly Notes to be enabled in Periodic Notes.");
        this.addPeriodicHeaderSetting("showQuarterlyNote", "Open quarterly note from calendar header", "Add a clickable quarter beside the month. Requires Quarterly Notes to be enabled in Periodic Notes.");
        this.addPeriodicHeaderSetting("showYearlyNote", "Open yearly note from calendar header", "Make the displayed year clickable. Requires Yearly Notes to be enabled in Periodic Notes.");
    }
    addPeriodicHeaderSetting(option, name, description) {
        new obsidian.Setting(this.containerEl)
            .setName(name)
            .setDesc(description)
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.options[option]);
            toggle.onChange(async (value) => {
                await this.plugin.writeOptions(() => ({ [option]: value }));
            });
        });
    }
    addDateAssociationSettings() {
        this.containerEl.createEl("h3", { text: "Date Associations" });
        new obsidian.Setting(this.containerEl)
            .setName("Show date-tagged items")
            .setDesc("Mark dates mentioned as exact #YYYY-MM-DD tags anywhere in the vault. Hover a marked date or use its context menu to see the matching notes.")
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.options.showDateTags);
            toggle.onChange(async (value) => {
                await this.plugin.writeOptions(() => ({ showDateTags: value }));
            });
        });
        new obsidian.Setting(this.containerEl)
            .setName("Use frontmatter dates as daily notes")
            .setDesc("Associate any note with a calendar day from a frontmatter property, useful for imported journals with more than one note per day.")
            .addToggle((toggle) => {
            toggle.setValue(this.plugin.options.useMetadataDates);
            toggle.onChange(async (value) => {
                await this.plugin.writeOptions(() => ({ useMetadataDates: value }));
                this.display();
            });
        });
        if (this.plugin.options.useMetadataDates) {
            new obsidian.Setting(this.containerEl)
                .setName("Frontmatter date property")
                .setDesc("The frontmatter key to read, such as date or created.")
                .addText((textfield) => {
                textfield.setPlaceholder("date");
                textfield.setValue(this.plugin.options.metadataDateProperty || "date");
                textfield.onChange(async (value) => {
                    await this.plugin.writeOptions(() => ({
                        metadataDateProperty: value.trim() || "date",
                    }));
                });
            });
            new obsidian.Setting(this.containerEl)
                .setName("Frontmatter date format")
                .setDesc("Moment format for the property. ISO dates and ISO timestamps are accepted automatically.")
                .addText((textfield) => {
                textfield.setPlaceholder("YYYY-MM-DD");
                textfield.setValue(this.plugin.options.metadataDateFormat || "YYYY-MM-DD");
                textfield.onChange(async (value) => {
                    await this.plugin.writeOptions(() => ({
                        metadataDateFormat: value.trim() || "YYYY-MM-DD",
                    }));
                });
            });
        }
    }
    addWeeklyNoteFormatSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Weekly note format")
            .setDesc("For more syntax help, refer to format reference")
            .addText((textfield) => {
            textfield.setValue(this.plugin.options.weeklyNoteFormat);
            textfield.setPlaceholder(DEFAULT_WEEK_FORMAT);
            textfield.onChange(async (value) => {
                this.plugin.writeOptions(() => ({ weeklyNoteFormat: value }));
            });
        });
    }
    addWeeklyNoteTemplateSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Weekly note template")
            .setDesc("Choose the file you want to use as the template for your weekly notes")
            .addText((textfield) => {
            textfield.setValue(this.plugin.options.weeklyNoteTemplate);
            textfield.onChange(async (value) => {
                this.plugin.writeOptions(() => ({ weeklyNoteTemplate: value }));
            });
        });
    }
    addWeeklyNoteFolderSetting() {
        new obsidian.Setting(this.containerEl)
            .setName("Weekly note folder")
            .setDesc("New weekly notes will be placed here")
            .addText((textfield) => {
            textfield.setValue(this.plugin.options.weeklyNoteFolder);
            textfield.onChange(async (value) => {
                this.plugin.writeOptions(() => ({ weeklyNoteFolder: value }));
            });
        });
    }
    addLocaleOverrideSetting() {
        var _a;
        const { moment } = window;
        const sysLocale = (_a = navigator.language) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        new obsidian.Setting(this.containerEl)
            .setName("Override locale:")
            .setDesc("Set this if you want to use a locale different from the default")
            .addDropdown((dropdown) => {
            dropdown.addOption("system-default", `Same as system (${sysLocale})`);
            moment.locales().forEach((locale) => {
                dropdown.addOption(locale, locale);
            });
            dropdown.setValue(this.plugin.options.localeOverride);
            dropdown.onChange(async (value) => {
                this.plugin.writeOptions(() => ({
                    localeOverride: value,
                }));
            });
        });
    }
}

/**
 * Helpers used by the embedded-calendar renderer.
 *
 * `obsidian-calendar-ui` configures Moment globally. That is fine for a
 * single sidebar view, but it makes two embedded calendars race when they use
 * different locale or week-start overrides. Everything in this module works
 * with locale data and per-instance Moment locales instead.
 */
const languageToMomentLocale = {
    en: "en-gb",
    zh: "zh-cn",
    "zh-tw": "zh-tw",
    ru: "ru",
    ko: "ko",
    it: "it",
    id: "id",
    ro: "ro",
    "pt-br": "pt-br",
    cz: "cs",
    da: "da",
    de: "de",
    es: "es",
    fr: "fr",
    no: "nn",
    pl: "pl",
    pt: "pt",
    tr: "tr",
    hi: "hi",
    nl: "nl",
    ar: "ar",
    ja: "ja",
};
const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
function savedObsidianLanguage() {
    var _a;
    try {
        return ((_a = localStorage.getItem("language")) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "en";
    }
    catch (_b) {
        return "en";
    }
}
function availableLocale(requestedLocale) {
    const requested = requestedLocale.toLowerCase();
    const locales = window.moment.locales();
    return (locales.find((locale) => locale.toLowerCase() === requested) ||
        locales.find((locale) => locale.toLowerCase() === requested.split("-")[0]) ||
        null);
}
/**
 * Resolve the locale without calling `moment.locale(name)`, whose static form
 * changes Moment's process-wide default locale.
 */
function resolveCalendarLocale(localeOverride = "system-default") {
    var _a;
    const obsidianLanguage = savedObsidianLanguage();
    const systemLanguage = (_a = navigator.language) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    let requestedLocale = languageToMomentLocale[obsidianLanguage] || obsidianLanguage;
    if (localeOverride !== "system-default") {
        requestedLocale = localeOverride;
    }
    else if (systemLanguage === null || systemLanguage === void 0 ? void 0 : systemLanguage.startsWith(obsidianLanguage)) {
        requestedLocale = systemLanguage;
    }
    // `locales()` is read-only. Prefer English over Moment's ambient default if
    // the requested locale has not been bundled by Obsidian.
    return availableLocale(requestedLocale) || availableLocale("en") || "en";
}
/** Return the Sunday-based day index for an embed's own week-start choice. */
function getCalendarWeekStartIndex(locale, weekStart = "locale") {
    const explicitWeekStart = weekdays.indexOf(weekStart);
    if (explicitWeekStart !== -1) {
        return explicitWeekStart;
    }
    return window.moment.localeData(locale).firstDayOfWeek();
}
/**
 * Localize an individual Moment without modifying the global Moment locale.
 */
function withCalendarLocale(date, locale) {
    return date.clone().locale(locale);
}
/**
 * Format weekday headings in the same order as the isolated calendar grid.
 * Moment's `d` token is numeric, while the Calendar setting historically uses
 * it as a shorthand for a single visible letter.
 */
function getCalendarWeekdayLabels(date, locale, weekStart, format = "ddd") {
    const normalizedFormat = format.trim() || "ddd";
    const momentFormat = normalizedFormat === "d" ? "dd" : normalizedFormat;
    const firstDay = withCalendarLocale(date, locale)
        .startOf("day")
        .day(weekStart);
    return Array.from({ length: 7 }, (_value, index) => {
        const label = firstDay.clone().add(index, "day").format(momentFormat);
        return normalizedFormat === "d" ? Array.from(label)[0] || label : label;
    });
}

const defaultDateFormatter = (date, format) => date.format(format);
function normalizedFolder(folder = "") {
    return obsidian.normalizePath(folder)
        .replace(/^\/+|\/+$/g, "")
        .replace(/^\.$/, "");
}
/** Build the exact vault path which a configured note would use for a date. */
function getConfiguredNotePath(date, settings, formatDate = defaultDateFormatter) {
    const format = settings === null || settings === void 0 ? void 0 : settings.format;
    if (!format) {
        return null;
    }
    const filename = `${formatDate(date, format)}.md`;
    const folder = normalizedFolder(settings.folder);
    return obsidian.normalizePath(folder ? `${folder}/${filename}` : filename);
}
/**
 * Return the note path relative to its configured folder, without its markdown
 * extension. This keeps formats which include nested folders working.
 */
function getRelativeConfiguredNotePath(file, settings) {
    const normalizedPath = obsidian.normalizePath(file.path);
    const folder = normalizedFolder(settings === null || settings === void 0 ? void 0 : settings.folder);
    const prefix = folder ? `${folder}/` : "";
    if (prefix && !normalizedPath.startsWith(prefix)) {
        return null;
    }
    if (!normalizedPath.toLowerCase().endsWith(".md")) {
        return null;
    }
    return normalizedPath.slice(prefix.length, -3);
}
/**
 * Moment cannot strictly parse a literal apostrophe in a format such as
 * `YYYY-MM-DD['s note]`. Fall back to its lenient parser only when formatting
 * the result reproduces the original path exactly.
 */
function parseConfiguredNoteDate(file, settings, locale) {
    const format = settings === null || settings === void 0 ? void 0 : settings.format;
    const relativePath = getRelativeConfiguredNotePath(file, settings);
    if (!format || relativePath === null) {
        return null;
    }
    const strict = locale
        ? window.moment(relativePath, format, locale, true)
        : window.moment(relativePath, format, true);
    if (strict.isValid()) {
        return strict;
    }
    const lenient = locale
        ? window.moment(relativePath, format, locale, false)
        : window.moment(relativePath, format, false);
    return lenient.isValid() && lenient.format(format) === relativePath
        ? lenient
        : null;
}
/** Find a configured note from a pre-built path index without date-UID loss. */
function getConfiguredNoteForDate(date, settings, notesByPath, formatDate = defaultDateFormatter) {
    const path = getConfiguredNotePath(date, settings, formatDate);
    return path ? notesByPath[path] || null : null;
}

function dailyNoteSettings() {
    const settings = getDailyNoteSettings() || {};
    return Object.assign(Object.assign({}, settings), { format: settings.format || DEFAULT_DAILY_NOTE_FORMAT });
}
function uniqueFiles(files) {
    const seen = new Set();
    return files.filter((file) => {
        if (seen.has(file.path)) {
            return false;
        }
        seen.add(file.path);
        return true;
    });
}
function addDateEntry(index, date, file) {
    const id = getDateUID(date, "day");
    const dateFiles = index.filesByDate[id] || [];
    if (!dateFiles.some((existing) => existing.path === file.path)) {
        dateFiles.push(file);
        index.filesByDate[id] = dateFiles;
        index.entries.push({ date: date.clone().startOf("day"), file });
    }
}
/** Parse a daily note path using the exact Daily Notes folder and format. */
function getDateFromDailyNoteFile(file, options = {}) {
    return parseConfiguredNoteDate(file, dailyNoteSettings(), options.locale);
}
function parseMetadataDateValue(value, format, locale) {
    if (value instanceof Date || typeof value === "number") {
        const date = window.moment(value);
        return date.isValid() ? date : null;
    }
    if (typeof value !== "string") {
        return null;
    }
    const configured = locale
        ? window.moment(value, format, locale, true)
        : window.moment(value, format, true);
    if (configured.isValid()) {
        return configured;
    }
    const iso = window.moment(value, window.moment.ISO_8601, true);
    return iso.isValid() ? iso : null;
}
/**
 * Read the configured frontmatter property as a calendar date. A strict custom
 * format is preferred, with ISO dates/timestamps accepted for imported notes.
 */
function getDateFromDailyNoteMetadata(file, options = {}) {
    var _a, _b, _c, _d;
    if (!options.useMetadataDates) {
        return null;
    }
    const property = ((_a = options.metadataDateProperty) === null || _a === void 0 ? void 0 : _a.trim()) || "date";
    const format = ((_b = options.metadataDateFormat) === null || _b === void 0 ? void 0 : _b.trim()) || "YYYY-MM-DD";
    const frontmatter = (_d = (_c = window.app.metadataCache) === null || _c === void 0 ? void 0 : _c.getFileCache(file)) === null || _d === void 0 ? void 0 : _d.frontmatter;
    const rawValue = frontmatter === null || frontmatter === void 0 ? void 0 : frontmatter[property];
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
        const date = parseMetadataDateValue(value, format, options.locale);
        if (date) {
            return date;
        }
    }
    return null;
}
/** Prefer a configured metadata date when that optional integration is on. */
function getDateFromCalendarDailyNote(file, options = {}) {
    return (getDateFromDailyNoteMetadata(file, options) ||
        getDateFromDailyNoteFile(file, options));
}
/**
 * Build a full daily-note index. Unlike the interface package's UID-only map,
 * this retains all files for a date and an exact path lookup for month/year
 * formats whose one note represents more than one calendar day.
 */
function getAllDailyNotesIndex(options = {}) {
    const index = {
        filesByPath: {},
        filesByDate: {},
        entries: [],
    };
    window.app.vault.getMarkdownFiles().forEach((file) => {
        index.filesByPath[file.path] = file;
        const filenameDate = getDateFromDailyNoteFile(file, options);
        if (filenameDate) {
            addDateEntry(index, filenameDate, file);
        }
        const metadataDate = getDateFromDailyNoteMetadata(file, options);
        if (metadataDate) {
            addDateEntry(index, metadataDate, file);
        }
    });
    index.entries.sort((left, right) => {
        const dateDifference = left.date.valueOf() - right.date.valueOf();
        return dateDifference || left.file.path.localeCompare(right.file.path);
    });
    return index;
}
/**
 * Resolve all notes for a clicked calendar date. The canonical path lookup is
 * deliberately first, so `YYYYMM` and quoted formats find their existing
 * shared note before a new note can be created.
 */
function getDailyNotesForDate(date, index, options = {}) {
    if (!index) {
        return [];
    }
    const configuredDate = options.locale ? date.clone().locale(options.locale) : date;
    const canonical = getConfiguredNoteForDate(configuredDate, dailyNoteSettings(), index.filesByPath);
    const indexed = index.filesByDate[getDateUID(date, "day")] || [];
    return uniqueFiles(canonical ? [canonical, ...indexed] : indexed);
}
function getDailyNoteForDate(date, index, options = {}) {
    return getDailyNotesForDate(date, index, options)[0] || null;
}
function getDailyNoteEntries(notes) {
    if (!notes) {
        return [];
    }
    const index = notes;
    if (Array.isArray(index.entries)) {
        return index.entries;
    }
    return Object.values(notes)
        .map((file) => {
        const date = getDateFromDailyNoteFile(file);
        return date ? { date, file } : null;
    })
        .filter((entry) => entry !== null)
        .sort((left, right) => left.date.valueOf() - right.date.valueOf());
}
function getAdjacentDailyNote(date, notes, direction) {
    const entries = getDailyNoteEntries(notes);
    if (direction === "previous") {
        for (let index = entries.length - 1; index >= 0; index -= 1) {
            if (entries[index].date.isBefore(date, "day")) {
                return entries[index];
            }
        }
        return null;
    }
    return entries.find((entry) => entry.date.isAfter(date, "day")) || null;
}

function getCalendarSettings(settings) {
    const candidate = settings;
    if (typeof (candidate === null || candidate === void 0 ? void 0 : candidate.weekStart) !== "string") {
        return null;
    }
    return {
        localeOverride: candidate.localeOverride || "system-default",
        weekStart: candidate.weekStart,
    };
}
/**
 * Get a named Moment locale whose week rule belongs to one Calendar instance.
 * Defining a locale briefly changes Moment's default, so restore it before
 * returning; all later work explicitly selects the returned locale per date.
 */
function resolveWeeklyMomentLocale(settings) {
    const calendarSettings = getCalendarSettings(settings);
    if (!calendarSettings) {
        return null;
    }
    const locale = resolveCalendarLocale(calendarSettings.localeOverride);
    if (calendarSettings.weekStart === "locale") {
        return locale;
    }
    const weekStart = getCalendarWeekStartIndex(locale, calendarSettings.weekStart);
    const customLocale = `erin-calendar-${locale}-dow-${weekStart}`;
    if (window.moment.locales().includes(customLocale)) {
        return customLocale;
    }
    const baseLocale = window.moment.localeData(locale);
    const previousLocale = window.moment.locale();
    try {
        window.moment.defineLocale(customLocale, {
            parentLocale: locale,
            week: Object.assign(Object.assign({}, (baseLocale._week || {})), { dow: weekStart }),
        });
    }
    finally {
        window.moment.locale(previousLocale);
    }
    return customLocale;
}
/** Return a clone whose native Moment week tokens honor this calendar. */
function withWeeklyMomentLocale(date, settings) {
    const locale = resolveWeeklyMomentLocale(settings);
    return locale ? date.clone().locale(locale) : date.clone();
}
/** Format a weekly note path without changing Moment's ambient locale. */
function formatWeeklyNoteDate(date, format, settings) {
    return withWeeklyMomentLocale(date, settings).format(format);
}
/** Build the selection/index key using this calendar's own week rule. */
function getWeeklyNoteDateUID(date, settings) {
    return `week-${withWeeklyMomentLocale(date, settings)
        .startOf("week")
        .format()}`;
}
function stringSetting(value) {
    return typeof value === "string" ? value.trim() : "";
}
/**
 * Merge this plugin's optional Weekly Note settings with the Calendar or
 * Periodic Notes settings exposed by obsidian-daily-notes-interface.
 *
 * Empty strings intentionally mean "inherit". That keeps the existing
 * sidebar behaviour while allowing a calendar embed to override any subset
 * of the three settings.
 */
function resolveWeeklyNoteSettings(settings) {
    const overrides = settings;
    const directSettings = settings;
    const fallback = getWeeklyNoteSettings() || {};
    return {
        format: stringSetting(overrides === null || overrides === void 0 ? void 0 : overrides.weeklyNoteFormat) ||
            stringSetting(directSettings === null || directSettings === void 0 ? void 0 : directSettings.format) ||
            stringSetting(fallback.format) ||
            DEFAULT_WEEKLY_NOTE_FORMAT,
        folder: stringSetting(overrides === null || overrides === void 0 ? void 0 : overrides.weeklyNoteFolder) ||
            stringSetting(directSettings === null || directSettings === void 0 ? void 0 : directSettings.folder) ||
            stringSetting(fallback.folder),
        template: stringSetting(overrides === null || overrides === void 0 ? void 0 : overrides.weeklyNoteTemplate) ||
            stringSetting(directSettings === null || directSettings === void 0 ? void 0 : directSettings.template) ||
            stringSetting(fallback.template),
    };
}

/** Parse weekly paths with the same quoted-format fallback as daily notes. */
function getDateFromWeeklyNoteFile(file, settings) {
    return parseConfiguredNoteDate(file, resolveWeeklyNoteSettings(settings), resolveWeeklyMomentLocale(settings) || undefined);
}
function getAllWeeklyNotesIndex(settings) {
    const index = {
        filesByPath: {},
        filesByDate: {},
    };
    const weeklyNoteSettings = resolveWeeklyNoteSettings(settings);
    const locale = resolveWeeklyMomentLocale(settings) || undefined;
    window.app.vault.getMarkdownFiles().forEach((file) => {
        index.filesByPath[file.path] = file;
        const date = parseConfiguredNoteDate(file, weeklyNoteSettings, locale);
        if (!date) {
            return;
        }
        const id = getWeeklyNoteDateUID(date, settings);
        const dateFiles = index.filesByDate[id] || [];
        if (!dateFiles.some((existing) => existing.path === file.path)) {
            dateFiles.push(file);
            index.filesByDate[id] = dateFiles;
        }
    });
    return index;
}
/**
 * Resolve by the exact configured path first, which covers formats containing
 * literal apostrophes and week/month/day combinations Moment cannot strictly
 * parse back from a filename.
 */
function getWeeklyNoteForDate(date, index, settings) {
    var _a;
    if (!index) {
        return null;
    }
    const weeklyNoteSettings = resolveWeeklyNoteSettings(settings);
    const localizedDate = withWeeklyMomentLocale(date, settings);
    const canonical = getConfiguredNoteForDate(
    // The caller may supply a start-of-week date calculated for an embedded
    // calendar's locale/week-start. Do not reapply Moment's global locale
    // here; the UID fallback below remains for legacy callers.
    localizedDate, weeklyNoteSettings, index.filesByPath, (formattedDate, format) => formatWeeklyNoteDate(formattedDate, format, settings));
    return canonical || ((_a = index.filesByDate[getWeeklyNoteDateUID(localizedDate, settings)]) === null || _a === void 0 ? void 0 : _a[0]) || null;
}

const classList = (obj) => {
    return Object.entries(obj)
        .filter(([_k, v]) => !!v)
        .map(([k, _k]) => k);
};
function clamp(num, lowerBound, upperBound) {
    return Math.min(Math.max(lowerBound, num), upperBound);
}
function partition(arr, predicate) {
    const pass = [];
    const fail = [];
    arr.forEach((elem) => {
        if (predicate(elem)) {
            pass.push(elem);
        }
        else {
            fail.push(elem);
        }
    });
    return [pass, fail];
}
/**
 * Lookup the dateUID for a given file. It compares the file path to the
 * configured daily note path/format and the filename to the weekly format.
 *
 * @param file
 */
function getDateUIDFromFile(file, dailyOptions = {}, calendarSettings) {
    if (!file) {
        return null;
    }
    let date = getDateFromCalendarDailyNote(file, dailyOptions);
    if (date) {
        return getDateUID(date, "day");
    }
    date = getDateFromWeeklyNoteFile(file, calendarSettings);
    if (date) {
        if (calendarSettings) {
            return getWeeklyNoteDateUID(date, calendarSettings);
        }
        return getDateUID(date, "week");
    }
    return null;
}
function getWordCount(text) {
    const spaceDelimitedChars = /A-Za-z\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC/
        .source;
    const nonSpaceDelimitedWords = /\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u4E00-\u9FD5/
        .source;
    const pattern = new RegExp([
        `(?:[0-9]+(?:(?:,|\\.)[0-9]+)*|[\\-${spaceDelimitedChars}])+`,
        nonSpaceDelimitedWords,
    ].join("|"), "g");
    return (text.match(pattern) || []).length;
}

const dateTagPattern = /^#?(\d{4}-\d{2}-\d{2})$/;
function dateFromTag(tag) {
    const match = dateTagPattern.exec(tag);
    if (!match) {
        return null;
    }
    const date = window.moment(match[1], "YYYY-MM-DD", true);
    return date.isValid() ? date : null;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Extract a concise event/task summary below a date tag. If a note only uses
 * frontmatter or has no list beneath the tag, its file name remains useful.
 */
function describeDateTag(contents, tag, fallback) {
    const tagExpression = new RegExp(`(?:^|\\s)${escapeRegExp(tag)}(?![A-Za-z0-9_/-])`);
    const lines = contents.split(/\r?\n/);
    const start = lines.findIndex((line) => tagExpression.test(line));
    if (start === -1) {
        return fallback;
    }
    const descriptions = [];
    for (let lineIndex = start + 1; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (/^#{1,6}\s/.test(line) || dateTagPattern.test(line.trim())) {
            break;
        }
        const task = /^\s*(?:[-*+]\s+)(?:\[[ xX]\]\s*)?(.*\S)\s*$/.exec(line);
        if (task) {
            descriptions.push(task[1]);
        }
        if (descriptions.length === 3) {
            break;
        }
    }
    return descriptions.length ? descriptions.join(" · ") : fallback;
}
/**
 * Index exact ISO date tags (`#YYYY-MM-DD`) across the vault once, rather than
 * scanning every note for every calendar cell.
 */
async function getAllDateTags() {
    const entriesByDate = {};
    const { metadataCache, vault } = window.app;
    for (const file of vault.getMarkdownFiles()) {
        const cache = metadataCache.getFileCache(file);
        if (!cache) {
            continue;
        }
        const tags = obsidian.getAllTags(cache) || [];
        const dates = tags
            .map((tag) => ({ date: dateFromTag(tag), tag }))
            .filter((entry) => entry.date !== null);
        if (!dates.length) {
            continue;
        }
        const contents = await vault.cachedRead(file);
        const seenIds = new Set();
        for (const { date, tag } of dates) {
            const id = getDateUID(date, "day");
            if (seenIds.has(id)) {
                continue;
            }
            seenIds.add(id);
            const entries = entriesByDate[id] || [];
            entries.push({
                date,
                description: describeDateTag(contents, tag, file.basename),
                file,
            });
            entriesByDate[id] = entries;
        }
    }
    return { entriesByDate };
}
function getDateTagEntries(date, index) {
    return (index === null || index === void 0 ? void 0 : index.entriesByDate[getDateUID(date, "day")]) || [];
}

const settings = writable(defaultSettings);
function getDailyNoteIndexOptions(options) {
    return {
        locale: resolveCalendarLocale(options.localeOverride),
        metadataDateFormat: options.metadataDateFormat,
        metadataDateProperty: options.metadataDateProperty,
        useMetadataDates: options.useMetadataDates,
    };
}
function createDailyNotesStore(settingsStore = settings) {
    let hasError = false;
    const store = writable(null);
    return Object.assign({ reindex: () => {
            try {
                const dailyNotes = getAllDailyNotesIndex(getDailyNoteIndexOptions(get_store_value(settingsStore)));
                store.set(dailyNotes);
                hasError = false;
            }
            catch (err) {
                if (!hasError) {
                    // Avoid error being shown multiple times
                    console.log("[Calendar] Failed to find daily notes folder", err);
                }
                store.set({ filesByPath: {}, filesByDate: {}, entries: [] });
                hasError = true;
            }
        } }, store);
}
function createWeeklyNotesStore(settingsStore = settings) {
    let hasError = false;
    const store = writable(null);
    return Object.assign({ reindex: () => {
            try {
                const weeklyNotes = getAllWeeklyNotesIndex(get_store_value(settingsStore));
                store.set(weeklyNotes);
                hasError = false;
            }
            catch (err) {
                if (!hasError) {
                    // Avoid error being shown multiple times
                    console.log("[Calendar] Failed to find weekly notes folder", err);
                }
                store.set({ filesByPath: {}, filesByDate: {} });
                hasError = true;
            }
        } }, store);
}
const dailyNotes = createDailyNotesStore();
const weeklyNotes = createWeeklyNotesStore();
function createDateTagsStore() {
    const store = writable({
        entriesByDate: {},
        version: 0,
    });
    let latestRequest = 0;
    let version = 0;
    return Object.assign({ reindex: async (enabled) => {
            const request = ++latestRequest;
            if (!enabled) {
                store.set({ entriesByDate: {}, version: ++version });
                return;
            }
            try {
                const index = await getAllDateTags();
                if (request === latestRequest) {
                    store.set(Object.assign(Object.assign({}, index), { version: ++version }));
                }
            }
            catch (err) {
                console.log("[Calendar] Failed to index date tags", err);
                if (request === latestRequest) {
                    store.set({ entriesByDate: {}, version: ++version });
                }
            }
        } }, store);
}
const dateTags = createDateTagsStore();
const activeDailyDate = writable(null);
function createSelectedFileStore(settingsStore = settings, activeDailyDateStore = activeDailyDate) {
    const store = writable(null);
    return Object.assign({ setFile: (file, selectedDailyDate) => {
            const dailyDate = selectedDailyDate ||
                (file
                    ? getDateFromCalendarDailyNote(file, getDailyNoteIndexOptions(get_store_value(settingsStore)))
                    : null);
            activeDailyDateStore.set(dailyDate ? dailyDate.clone().startOf("day") : null);
            store.set(dailyDate
                ? getDateUID(dailyDate, "day")
                : getDateUIDFromFile(file, getDailyNoteIndexOptions(get_store_value(settingsStore)), get_store_value(settingsStore)));
        } }, store);
}
const activeFile = createSelectedFileStore();
/** Build selection stores that belong to one embedded calendar. */
function createCalendarSelection(settingsStore) {
    const activeDailyDate = writable(null);
    return {
        activeDailyDate,
        activeFile: createSelectedFileStore(settingsStore, activeDailyDate),
    };
}

class ConfirmationModal extends obsidian.Modal {
    constructor(app, config) {
        super(app);
        const { cta, onAccept, text, title } = config;
        this.contentEl.createEl("h2", { text: title });
        this.contentEl.createEl("p", { text });
        this.contentEl.createDiv("modal-button-container", (buttonsEl) => {
            buttonsEl
                .createEl("button", { text: "Never mind" })
                .addEventListener("click", () => this.close());
            buttonsEl
                .createEl("button", {
                cls: "mod-cta",
                text: cta,
            })
                .addEventListener("click", async (e) => {
                await onAccept(e);
                this.close();
            });
        });
    }
}
function createConfirmationDialog({ cta, onAccept, text, title, }) {
    new ConfirmationModal(window.app, { cta, onAccept, text, title }).open();
}
class FilePickerModal extends obsidian.Modal {
    constructor(app, config) {
        super(app);
        this.contentEl.createEl("h2", { text: config.title });
        this.contentEl.createEl("p", { text: config.text });
        const filesEl = this.contentEl.createDiv("erin-calendar-file-picker");
        config.files.forEach((file) => {
            filesEl
                .createEl("button", { text: file.path })
                .addEventListener("click", async () => {
                await config.onChoose(file);
                this.close();
            });
        });
    }
}
/** Let the user choose when multiple imported notes map to one calendar day. */
function showFilePicker(config) {
    new FilePickerModal(window.app, config).open();
}

/**
 * A modifier-click represents a new tab, not a split beside the active pane.
 * Plain clicks retain Obsidian's normal reusable-leaf behavior.
 */
function getNoteLeaf(inNewTab) {
    const { workspace } = window.app;
    return inNewTab ? workspace.getLeaf("tab") : workspace.getUnpinnedLeaf();
}

const headerNoteLabels = {
    month: "Monthly",
    quarter: "Quarterly",
    year: "Yearly",
};
function getExistingPeriodicNote(granularity, date) {
    const path = getConfiguredNotePath(date, getPeriodicNoteSettings(granularity));
    if (!path) {
        return null;
    }
    const file = window.app.vault.getAbstractFileByPath(path);
    return file instanceof obsidian.TFile ? file : null;
}
async function tryToCreatePeriodicNote(granularity, date, inNewTab, settings, cb) {
    const noteSettings = getPeriodicNoteSettings(granularity);
    const filename = date.format(noteSettings.format);
    const label = headerNoteLabels[granularity];
    const createFile = async () => {
        const note = await createPeriodicNote(granularity, date);
        if (!note) {
            return;
        }
        const leaf = getNoteLeaf(inNewTab);
        await leaf.openFile(note, { active: true });
        cb === null || cb === void 0 ? void 0 : cb(note);
    };
    if (settings.shouldConfirmBeforeCreate) {
        createConfirmationDialog({
            cta: "Create",
            onAccept: createFile,
            text: `File ${filename} does not exist. Would you like to create it?`,
            title: `New ${label} Note`,
        });
    }
    else {
        await createFile();
    }
}

const templateDateUnits$1 = {
    y: "y",
    q: "Q",
    m: "m",
    w: "w",
    d: "d",
    h: "h",
    s: "s",
};
function joinPaths$1(...partSegments) {
    let parts = [];
    partSegments.forEach((part) => {
        parts = parts.concat(part.split("/"));
    });
    const normalizedParts = [];
    parts.forEach((part) => {
        if (part && part !== ".") {
            normalizedParts.push(part);
        }
    });
    if (parts[0] === "") {
        normalizedParts.unshift("");
    }
    return normalizedParts.join("/");
}
async function getNotePath(directory, filename) {
    const markdownFilename = filename.endsWith(".md")
        ? filename
        : `${filename}.md`;
    const path = obsidian.normalizePath(joinPaths$1(directory, markdownFilename));
    const folder = path.replace(/\\/g, "/").split("/").slice(0, -1);
    if (folder.length) {
        const folderPath = joinPaths$1(...folder);
        if (!window.app.vault.getAbstractFileByPath(folderPath)) {
            await window.app.vault.createFolder(folderPath);
        }
    }
    return path;
}
/**
 * Expand Daily Notes template tokens for a note created from Calendar.
 *
 * The core Daily Notes command uses the current date for a bare {{date}}
 * token. Preserve that behavior here while keeping the selected calendar date
 * for the filename, title, and date-aware tokens.
 */
function expandDailyNoteTemplate(templateContents, date, format, now = window.moment()) {
    const filename = date.format(format);
    return templateContents
        .replace(/{{\s*date\s*}}/gi, now.format(format))
        .replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
        .replace(/{{\s*title\s*}}/gi, filename)
        .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_match, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
        const targetDate = date.clone().set({
            hour: now.get("hour"),
            minute: now.get("minute"),
            second: now.get("second"),
        });
        if (calc) {
            targetDate.add(parseInt(timeDelta, 10), templateDateUnits$1[unit]);
        }
        if (momentFormat) {
            return targetDate.format(momentFormat.substring(1).trim());
        }
        return targetDate.format(format);
    })
        .replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(format))
        .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "day").format(format));
}
/**
 * Create a daily note using the configured Daily Notes settings.
 *
 * This mirrors the interface package's creator except for bare {{date}},
 * which intentionally resolves to the date on which the note is created.
 */
async function createCalendarDailyNote(date) {
    const app = window.app;
    const { vault } = app;
    const { template, format, folder } = getDailyNoteSettings();
    const filename = date.format(format);
    const [templateContents, foldInfo] = await getTemplateInfo(template);
    const path = await getNotePath(folder, filename);
    try {
        const createdFile = await vault.create(path, expandDailyNoteTemplate(templateContents, date, format));
        const foldManager = app.foldManager;
        foldManager === null || foldManager === void 0 ? void 0 : foldManager.save(createdFile, foldInfo);
        return createdFile;
    }
    catch (err) {
        console.error(`Failed to create file: '${path}'`, err);
        new obsidian.Notice("Unable to create new file.");
        return null;
    }
}
/**
 * Create a Daily Note for a given date.
 */
async function tryToCreateDailyNote(date, inNewSplit, settings, cb) {
    const { format } = getDailyNoteSettings();
    const filename = date.format(format);
    const createFile = async () => {
        const dailyNote = await createCalendarDailyNote(date);
        if (!dailyNote) {
            return;
        }
        const leaf = getNoteLeaf(inNewSplit);
        await leaf.openFile(dailyNote, { active: true });
        cb === null || cb === void 0 ? void 0 : cb(dailyNote);
    };
    if (settings.shouldConfirmBeforeCreate) {
        createConfirmationDialog({
            cta: "Create",
            onAccept: createFile,
            text: `File ${filename} does not exist. Would you like to create it?`,
            title: "New Daily Note",
        });
    }
    else {
        await createFile();
    }
}

const templateDateUnits = {
    y: "y",
    q: "Q",
    m: "m",
    w: "w",
    d: "d",
    h: "h",
    s: "s",
};
function joinPaths(...partSegments) {
    let parts = [];
    partSegments.forEach((part) => {
        parts = parts.concat(part.split("/"));
    });
    const normalizedParts = [];
    parts.forEach((part) => {
        if (part && part !== ".") {
            normalizedParts.push(part);
        }
    });
    if (parts[0] === "") {
        normalizedParts.unshift("");
    }
    return normalizedParts.join("/");
}
async function getWeeklyNotePath(directory, filename) {
    const markdownFilename = filename.endsWith(".md")
        ? filename
        : `${filename}.md`;
    const path = obsidian.normalizePath(joinPaths(directory, markdownFilename));
    const folder = path.replace(/\\/g, "/").split("/").slice(0, -1);
    if (folder.length) {
        const folderPath = joinPaths(...folder);
        if (!window.app.vault.getAbstractFileByPath(folderPath)) {
            await window.app.vault.createFolder(folderPath);
        }
    }
    return path;
}
function getDaysOfWeek(date) {
    let weekStart = date.localeData().firstDayOfWeek();
    const daysOfWeek = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ];
    while (weekStart) {
        daysOfWeek.push(daysOfWeek.shift());
        weekStart -= 1;
    }
    return daysOfWeek;
}
/** Expand the same date, title, time, and weekday tokens as Weekly Notes. */
function expandWeeklyNoteTemplate(templateContents, date, format, now = window.moment(), settings) {
    const weeklyDate = withWeeklyMomentLocale(date, settings);
    const filename = formatWeeklyNoteDate(weeklyDate, format, settings);
    return templateContents
        .replace(/{{\s*date\s*}}/gi, formatWeeklyNoteDate(weeklyDate, format, settings))
        .replace(/{{\s*time\s*}}/gi, now.format("HH:mm"))
        .replace(/{{\s*title\s*}}/gi, filename)
        .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_match, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
        const targetDate = weeklyDate.clone().set({
            hour: now.get("hour"),
            minute: now.get("minute"),
            second: now.get("second"),
        });
        if (calc) {
            targetDate.add(parseInt(timeDelta, 10), templateDateUnits[unit.toLowerCase()]);
        }
        if (momentFormat) {
            return formatWeeklyNoteDate(targetDate, momentFormat.substring(1).trim(), settings);
        }
        return formatWeeklyNoteDate(targetDate, format, settings);
    })
        .replace(/{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi, (_match, dayOfWeek, momentFormat) => {
        const day = getDaysOfWeek(weeklyDate).indexOf(dayOfWeek.toLowerCase());
        return weeklyDate.clone().weekday(day).format(momentFormat.trim());
    });
}
/**
 * Create a Weekly Note with the supplied Calendar settings. Empty Calendar
 * values inherit their corresponding setting from Calendar or Periodic Notes.
 */
async function createCalendarWeeklyNote(date, settings) {
    const { folder, format, template } = resolveWeeklyNoteSettings(settings);
    const weeklyDate = withWeeklyMomentLocale(date, settings);
    const filename = formatWeeklyNoteDate(weeklyDate, format, settings);
    let path = filename;
    try {
        const [templateContents, foldInfo] = await getTemplateInfo(template);
        path = await getWeeklyNotePath(folder, filename);
        const createdFile = await window.app.vault.create(path, expandWeeklyNoteTemplate(templateContents, weeklyDate, format, undefined, settings));
        const foldManager = window.app.foldManager;
        foldManager === null || foldManager === void 0 ? void 0 : foldManager.save(createdFile, foldInfo);
        return createdFile;
    }
    catch (err) {
        console.error(`Failed to create file: '${path}'`, err);
        new obsidian.Notice("Unable to create new file.");
        return null;
    }
}
/**
 * Create a Weekly Note for a given date.
 */
async function tryToCreateWeeklyNote(date, inNewSplit, settings, cb) {
    const { format } = resolveWeeklyNoteSettings(settings);
    const filename = formatWeeklyNoteDate(date, format, settings);
    const createFile = async () => {
        const dailyNote = await createCalendarWeeklyNote(date, settings);
        if (!dailyNote) {
            return;
        }
        const leaf = getNoteLeaf(inNewSplit);
        await leaf.openFile(dailyNote, { active: true });
        cb === null || cb === void 0 ? void 0 : cb(dailyNote);
    };
    if (settings.shouldConfirmBeforeCreate) {
        createConfirmationDialog({
            cta: "Create",
            onAccept: createFile,
            text: `File ${filename} does not exist. Would you like to create it?`,
            title: "New Weekly Note",
        });
    }
    else {
        await createFile();
    }
}

function daysInYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
        ? 366
        : 365;
}
// This is Moment's week-number calculation expressed without updating a
// Moment locale. `doy` remains locale-specific while `dow` is per embed.
function firstWeekOffset(year, dow, doy) {
    const firstWeekDay = 7 + dow - doy;
    const localWeekday = (7 + new Date(Date.UTC(year, 0, firstWeekDay)).getUTCDay() - dow) % 7;
    return -localWeekday + firstWeekDay - 1;
}
function weeksInYear(year, dow, doy) {
    const thisYearOffset = firstWeekOffset(year, dow, doy);
    const nextYearOffset = firstWeekOffset(year + 1, dow, doy);
    return (daysInYear(year) - thisYearOffset + nextYearOffset) / 7;
}
/** Calculate a locale-style week number for the supplied per-embed week start. */
function getCalendarWeekNumber(date, weekStart, localeFirstDayOfYear) {
    const weekOffset = firstWeekOffset(date.year(), weekStart, localeFirstDayOfYear);
    let week = Math.floor((date.dayOfYear() - weekOffset - 1) / 7) + 1;
    if (week < 1) {
        week += weeksInYear(date.year() - 1, weekStart, localeFirstDayOfYear);
    }
    else if (week > weeksInYear(date.year(), weekStart, localeFirstDayOfYear)) {
        week -= weeksInYear(date.year(), weekStart, localeFirstDayOfYear);
    }
    return week;
}
/** Generate the six calendar rows without reading Moment's global locale. */
function getCalendarMonth(displayedMonth, locale, weekStart, localeFirstDayOfYear) {
    const startOfMonth = withCalendarLocale(displayedMonth, locale)
        .date(1)
        .startOf("day");
    const startOffset = (startOfMonth.day() - weekStart + 7) % 7;
    let date = startOfMonth.clone().subtract(startOffset, "days");
    const month = [];
    for (let dayIndex = 0; dayIndex < 42; dayIndex += 1) {
        if (dayIndex % 7 === 0) {
            month.push({
                days: [],
                weekNum: getCalendarWeekNumber(date, weekStart, localeFirstDayOfYear),
            });
        }
        month[month.length - 1].days.push(date);
        date = date.clone().add(1, "day");
    }
    return month;
}
/**
 * Generate twelve independent month grids for the year containing the cursor.
 *
 * Each grid retains the locale and per-calendar week-start calculation used by
 * the normal month view. The year view can then hide adjacent-month dates
 * without changing the underlying week layout or week-number actions.
 */
function getCalendarYearMonths(displayedMonth, locale, weekStart, localeFirstDayOfYear) {
    const startOfYear = withCalendarLocale(displayedMonth, locale)
        .startOf("year")
        .startOf("day");
    return Array.from({ length: 12 }, (_value, monthIndex) => {
        const month = startOfYear.clone().month(monthIndex).date(1);
        return {
            month,
            weeks: getCalendarMonth(month, locale, weekStart, localeFirstDayOfYear),
        };
    });
}
function getCalendarWeekStart(date, weekStart) {
    const offset = (date.day() - weekStart + 7) % 7;
    return date.clone().startOf("day").subtract(offset, "days");
}
function getCalendarDayUID(date) {
    return `day-${date.clone().startOf("day").format()}`;
}
function getCalendarWeekUID(date, weekStart) {
    return `week-${getCalendarWeekStart(date, weekStart).format()}`;
}
function isWeekend(date) {
    return date.isoWeekday() === 6 || date.isoWeekday() === 7;
}

/* src/ui/isolatedCalendar/Dot.svelte generated by Svelte v3.59.2 */

function add_css$8(target) {
	append_styles(target, "svelte-1x17ntc", ".dot.svelte-1x17ntc,.hollow.svelte-1x17ntc{display:inline-block;height:6px;margin:0 1px;width:6px}.filled.svelte-1x17ntc{fill:var(--color-dot)}.active.filled.svelte-1x17ntc{fill:var(--text-on-accent)}.hollow.svelte-1x17ntc{fill:none;stroke:var(--color-dot)}.active.hollow.svelte-1x17ntc{fill:none;stroke:var(--text-on-accent)}");
}

// (15:0) {:else}
function create_else_block$3(ctx) {
	let svg;
	let circle;
	let svg_class_value;

	return {
		c() {
			svg = svg_element("svg");
			circle = svg_element("circle");
			attr(circle, "cx", "3");
			attr(circle, "cy", "3");
			attr(circle, "r", "2");
			attr(svg, "class", svg_class_value = "" + (null_to_empty(`hollow ${/*className*/ ctx[0]}`) + " svelte-1x17ntc"));
			attr(svg, "viewBox", "0 0 6 6");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			toggle_class(svg, "active", /*isActive*/ ctx[2]);
		},
		m(target, anchor) {
			insert(target, svg, anchor);
			append(svg, circle);
		},
		p(ctx, dirty) {
			if (dirty & /*className*/ 1 && svg_class_value !== (svg_class_value = "" + (null_to_empty(`hollow ${/*className*/ ctx[0]}`) + " svelte-1x17ntc"))) {
				attr(svg, "class", svg_class_value);
			}

			if (dirty & /*className, isActive*/ 5) {
				toggle_class(svg, "active", /*isActive*/ ctx[2]);
			}
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

// (6:0) {#if isFilled}
function create_if_block$4(ctx) {
	let svg;
	let circle;
	let svg_class_value;

	return {
		c() {
			svg = svg_element("svg");
			circle = svg_element("circle");
			attr(circle, "cx", "3");
			attr(circle, "cy", "3");
			attr(circle, "r", "2");
			attr(svg, "class", svg_class_value = "" + (null_to_empty(`dot filled ${/*className*/ ctx[0]}`) + " svelte-1x17ntc"));
			attr(svg, "viewBox", "0 0 6 6");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			toggle_class(svg, "active", /*isActive*/ ctx[2]);
		},
		m(target, anchor) {
			insert(target, svg, anchor);
			append(svg, circle);
		},
		p(ctx, dirty) {
			if (dirty & /*className*/ 1 && svg_class_value !== (svg_class_value = "" + (null_to_empty(`dot filled ${/*className*/ ctx[0]}`) + " svelte-1x17ntc"))) {
				attr(svg, "class", svg_class_value);
			}

			if (dirty & /*className, isActive*/ 5) {
				toggle_class(svg, "active", /*isActive*/ ctx[2]);
			}
		},
		d(detaching) {
			if (detaching) detach(svg);
		}
	};
}

function create_fragment$9(ctx) {
	let if_block_anchor;

	function select_block_type(ctx, dirty) {
		if (/*isFilled*/ ctx[1]) return create_if_block$4;
		return create_else_block$3;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

function instance$9($$self, $$props, $$invalidate) {
	let { className = "" } = $$props;
	let { isFilled } = $$props;
	let { isActive } = $$props;

	$$self.$$set = $$props => {
		if ('className' in $$props) $$invalidate(0, className = $$props.className);
		if ('isFilled' in $$props) $$invalidate(1, isFilled = $$props.isFilled);
		if ('isActive' in $$props) $$invalidate(2, isActive = $$props.isActive);
	};

	return [className, isFilled, isActive];
}

class Dot extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$9, create_fragment$9, safe_not_equal, { className: 0, isFilled: 1, isActive: 2 }, add_css$8);
	}
}

/* src/ui/isolatedCalendar/MetadataResolver.svelte generated by Svelte v3.59.2 */

const get_default_slot_changes_2 = dirty => ({});

const get_default_slot_context_2 = ctx => ({
	metadata: {
		classes: [],
		dots: [],
		dataAttributes: {}
	}
});

const get_default_slot_changes_1 = dirty => ({});

const get_default_slot_context_1 = ctx => ({
	metadata: {
		classes: [],
		dots: [],
		dataAttributes: {}
	}
});

const get_default_slot_changes = dirty => ({ metadata: dirty & /*metadata*/ 1 });
const get_default_slot_context = ctx => ({ metadata: /*resolvedMetadata*/ ctx[3] });

// (10:0) {:else}
function create_else_block$2(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], get_default_slot_context_2);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 2)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[1],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, get_default_slot_changes_2),
						get_default_slot_context_2
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

// (4:0) {#if metadata}
function create_if_block$3(ctx) {
	let await_block_anchor;
	let promise;
	let current;

	let info = {
		ctx,
		current: null,
		token: null,
		hasCatch: true,
		pending: create_pending_block,
		then: create_then_block,
		catch: create_catch_block,
		value: 3,
		blocks: [,,,]
	};

	handle_promise(promise = /*metadata*/ ctx[0], info);

	return {
		c() {
			await_block_anchor = empty();
			info.block.c();
		},
		m(target, anchor) {
			insert(target, await_block_anchor, anchor);
			info.block.m(target, info.anchor = anchor);
			info.mount = () => await_block_anchor.parentNode;
			info.anchor = await_block_anchor;
			current = true;
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			info.ctx = ctx;

			if (dirty & /*metadata*/ 1 && promise !== (promise = /*metadata*/ ctx[0]) && handle_promise(promise, info)) ; else {
				update_await_block_branch(info, ctx, dirty);
			}
		},
		i(local) {
			if (current) return;
			transition_in(info.block);
			current = true;
		},
		o(local) {
			for (let i = 0; i < 3; i += 1) {
				const block = info.blocks[i];
				transition_out(block);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(await_block_anchor);
			info.block.d(detaching);
			info.token = null;
			info = null;
		}
	};
}

// (7:2) {:catch}
function create_catch_block(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], get_default_slot_context_1);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 2)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[1],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, get_default_slot_changes_1),
						get_default_slot_context_1
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

// (5:41)      <slot metadata={resolvedMetadata}
function create_then_block(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], get_default_slot_context);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope, metadata*/ 3)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[1],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[1])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[1], dirty, get_default_slot_changes),
						get_default_slot_context
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

// (1:0) <script lang="ts">export let metadata; </script>  {#if metadata}
function create_pending_block(ctx) {
	return {
		c: noop,
		m: noop,
		p: noop,
		i: noop,
		o: noop,
		d: noop
	};
}

function create_fragment$8(ctx) {
	let current_block_type_index;
	let if_block;
	let if_block_anchor;
	let current;
	const if_block_creators = [create_if_block$3, create_else_block$2];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*metadata*/ ctx[0]) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c() {
			if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(if_block_anchor.parentNode, if_block_anchor);
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if_blocks[current_block_type_index].d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

function instance$8($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	let { metadata } = $$props;

	$$self.$$set = $$props => {
		if ('metadata' in $$props) $$invalidate(0, metadata = $$props.metadata);
		if ('$$scope' in $$props) $$invalidate(1, $$scope = $$props.$$scope);
	};

	return [metadata, $$scope, slots];
}

class MetadataResolver extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$8, create_fragment$8, safe_not_equal, { metadata: 0 });
	}
}

/* src/ui/isolatedCalendar/Day.svelte generated by Svelte v3.59.2 */

function add_css$7(target) {
	append_styles(target, "svelte-3czoh5", ".day.svelte-3czoh5.svelte-3czoh5{background-color:var(--color-background-day);border-radius:4px;color:var(--color-text-day);cursor:pointer;font-size:0.8em;height:100%;padding:4px;position:relative;text-align:center;transition:background-color 0.1s ease-in, color 0.1s ease-in;vertical-align:baseline}.day.svelte-3czoh5.svelte-3czoh5:hover{background-color:var(--interactive-hover)}.day.active.svelte-3czoh5.svelte-3czoh5:hover{background-color:var(--interactive-accent-hover)}.adjacent-month.svelte-3czoh5.svelte-3czoh5{opacity:0.25}.today.svelte-3czoh5.svelte-3czoh5{color:var(--color-text-today)}.day.svelte-3czoh5.svelte-3czoh5:active,.active.svelte-3czoh5.svelte-3czoh5,.active.today.svelte-3czoh5.svelte-3czoh5{background-color:var(--interactive-accent);color:var(--text-on-accent)}.dot-container.svelte-3czoh5.svelte-3czoh5{display:flex;flex-wrap:wrap;justify-content:center;line-height:6px;min-height:6px}.day.compact.svelte-3czoh5.svelte-3czoh5{font-size:0.7em;min-height:1.6em;padding:2px 0}.day.compact.svelte-3czoh5 .dot-container.svelte-3czoh5{line-height:4px;min-height:4px}");
}

function get_each_context$3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[12] = list[i];
	return child_ctx;
}

// (38:8) {#each metadata.dots as dot}
function create_each_block$3(ctx) {
	let dot;
	let current;

	const dot_spread_levels = [
		/*dot*/ ctx[12],
		{
			isActive: /*selectedId*/ ctx[6] === getCalendarDayUID(/*date*/ ctx[0])
		}
	];

	let dot_props = {};

	for (let i = 0; i < dot_spread_levels.length; i += 1) {
		dot_props = assign(dot_props, dot_spread_levels[i]);
	}

	dot = new Dot({ props: dot_props });

	return {
		c() {
			create_component(dot.$$.fragment);
		},
		m(target, anchor) {
			mount_component(dot, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const dot_changes = (dirty & /*metadata, selectedId, getCalendarDayUID, date*/ 321)
			? get_spread_update(dot_spread_levels, [
					dirty & /*metadata*/ 256 && get_spread_object(/*dot*/ ctx[12]),
					dirty & /*selectedId, getCalendarDayUID, date*/ 65 && {
						isActive: /*selectedId*/ ctx[6] === getCalendarDayUID(/*date*/ ctx[0])
					}
				])
			: {};

			dot.$set(dot_changes);
		},
		i(local) {
			if (current) return;
			transition_in(dot.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(dot.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(dot, detaching);
		}
	};
}

// (21:2) <MetadataResolver {metadata} let:metadata>
function create_default_slot$1(ctx) {
	let div1;
	let t0_value = /*date*/ ctx[0].format("D") + "";
	let t0;
	let t1;
	let div0;
	let div1_class_value;
	let div1_aria_current_value;
	let div1_aria_label_value;
	let current;
	let mounted;
	let dispose;
	let each_value = /*metadata*/ ctx[8].dots;
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	let div1_levels = [
		{
			class: div1_class_value = `day ${/*metadata*/ ctx[8].classes.join(" ")}`
		},
		{
			"aria-current": div1_aria_current_value = /*date*/ ctx[0].isSame(/*today*/ ctx[4], "day")
			? "date"
			: undefined
		},
		{
			"aria-label": div1_aria_label_value = /*date*/ ctx[0].format("LL")
		},
		/*metadata*/ ctx[8].dataAttributes
	];

	let div_data_1 = {};

	for (let i = 0; i < div1_levels.length; i += 1) {
		div_data_1 = assign(div_data_1, div1_levels[i]);
	}

	return {
		c() {
			div1 = element("div");
			t0 = text(t0_value);
			t1 = space();
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(div0, "class", "dot-container svelte-3czoh5");
			set_attributes(div1, div_data_1);
			toggle_class(div1, "active", /*selectedId*/ ctx[6] === getCalendarDayUID(/*date*/ ctx[0]));
			toggle_class(div1, "adjacent-month", !/*date*/ ctx[0].isSame(/*displayedMonth*/ ctx[5], "month"));
			toggle_class(div1, "today", /*date*/ ctx[0].isSame(/*today*/ ctx[4], "day"));
			toggle_class(div1, "compact", /*compact*/ ctx[7]);
			toggle_class(div1, "svelte-3czoh5", true);
		},
		m(target, anchor) {
			insert(target, div1, anchor);
			append(div1, t0);
			append(div1, t1);
			append(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}

			current = true;

			if (!mounted) {
				dispose = [
					listen(div1, "click", function () {
						if (is_function(/*onClick*/ ctx[2] && /*click_handler*/ ctx[9])) (/*onClick*/ ctx[2] && /*click_handler*/ ctx[9]).apply(this, arguments);
					}),
					listen(div1, "contextmenu", function () {
						if (is_function(/*onContextMenu*/ ctx[3] && /*contextmenu_handler*/ ctx[10])) (/*onContextMenu*/ ctx[3] && /*contextmenu_handler*/ ctx[10]).apply(this, arguments);
					}),
					listen(div1, "pointerover", function () {
						if (is_function(/*onHover*/ ctx[1] && /*pointerover_handler*/ ctx[11])) (/*onHover*/ ctx[1] && /*pointerover_handler*/ ctx[11]).apply(this, arguments);
					})
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if ((!current || dirty & /*date*/ 1) && t0_value !== (t0_value = /*date*/ ctx[0].format("D") + "")) set_data_maybe_contenteditable(t0, t0_value, div_data_1['contenteditable']);

			if (dirty & /*metadata, selectedId, getCalendarDayUID, date*/ 321) {
				each_value = /*metadata*/ ctx[8].dots;
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$3(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$3(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(div0, null);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}

			set_attributes(div1, div_data_1 = get_spread_update(div1_levels, [
				(!current || dirty & /*metadata*/ 256 && div1_class_value !== (div1_class_value = `day ${/*metadata*/ ctx[8].classes.join(" ")}`)) && { class: div1_class_value },
				(!current || dirty & /*date, today*/ 17 && div1_aria_current_value !== (div1_aria_current_value = /*date*/ ctx[0].isSame(/*today*/ ctx[4], "day")
				? "date"
				: undefined)) && { "aria-current": div1_aria_current_value },
				(!current || dirty & /*date*/ 1 && div1_aria_label_value !== (div1_aria_label_value = /*date*/ ctx[0].format("LL"))) && { "aria-label": div1_aria_label_value },
				dirty & /*metadata*/ 256 && /*metadata*/ ctx[8].dataAttributes
			]));

			toggle_class(div1, "active", /*selectedId*/ ctx[6] === getCalendarDayUID(/*date*/ ctx[0]));
			toggle_class(div1, "adjacent-month", !/*date*/ ctx[0].isSame(/*displayedMonth*/ ctx[5], "month"));
			toggle_class(div1, "today", /*date*/ ctx[0].isSame(/*today*/ ctx[4], "day"));
			toggle_class(div1, "compact", /*compact*/ ctx[7]);
			toggle_class(div1, "svelte-3czoh5", true);
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(div1);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment$7(ctx) {
	let td;
	let metadataresolver;
	let current;

	metadataresolver = new MetadataResolver({
			props: {
				metadata: /*metadata*/ ctx[8],
				$$slots: {
					default: [
						create_default_slot$1,
						({ metadata }) => ({ 8: metadata }),
						({ metadata }) => metadata ? 256 : 0
					]
				},
				$$scope: { ctx }
			}
		});

	return {
		c() {
			td = element("td");
			create_component(metadataresolver.$$.fragment);
		},
		m(target, anchor) {
			insert(target, td, anchor);
			mount_component(metadataresolver, td, null);
			current = true;
		},
		p(ctx, [dirty]) {
			const metadataresolver_changes = {};
			if (dirty & /*metadata*/ 256) metadataresolver_changes.metadata = /*metadata*/ ctx[8];

			if (dirty & /*$$scope, metadata, date, today, selectedId, displayedMonth, compact, onClick, onContextMenu, onHover*/ 33279) {
				metadataresolver_changes.$$scope = { dirty, ctx };
			}

			metadataresolver.$set(metadataresolver_changes);
		},
		i(local) {
			if (current) return;
			transition_in(metadataresolver.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(metadataresolver.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(td);
			destroy_component(metadataresolver);
		}
	};
}

function isMetaPressed$1(event) {
	return navigator.platform.includes("Mac")
	? event.metaKey
	: event.ctrlKey;
}

function instance$7($$self, $$props, $$invalidate) {
	let { date } = $$props;
	let { metadata } = $$props;
	let { onHover } = $$props;
	let { onClick } = $$props;
	let { onContextMenu } = $$props;
	let { today } = $$props;
	let { displayedMonth = null } = $$props;
	let { selectedId = null } = $$props;
	let { compact = false } = $$props;
	const click_handler = event => onClick(date, isMetaPressed$1(event));
	const contextmenu_handler = event => onContextMenu(date, event);
	const pointerover_handler = event => onHover(date, event.target, isMetaPressed$1(event));

	$$self.$$set = $$props => {
		if ('date' in $$props) $$invalidate(0, date = $$props.date);
		if ('metadata' in $$props) $$invalidate(8, metadata = $$props.metadata);
		if ('onHover' in $$props) $$invalidate(1, onHover = $$props.onHover);
		if ('onClick' in $$props) $$invalidate(2, onClick = $$props.onClick);
		if ('onContextMenu' in $$props) $$invalidate(3, onContextMenu = $$props.onContextMenu);
		if ('today' in $$props) $$invalidate(4, today = $$props.today);
		if ('displayedMonth' in $$props) $$invalidate(5, displayedMonth = $$props.displayedMonth);
		if ('selectedId' in $$props) $$invalidate(6, selectedId = $$props.selectedId);
		if ('compact' in $$props) $$invalidate(7, compact = $$props.compact);
	};

	return [
		date,
		onHover,
		onClick,
		onContextMenu,
		today,
		displayedMonth,
		selectedId,
		compact,
		metadata,
		click_handler,
		contextmenu_handler,
		pointerover_handler
	];
}

class Day extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$7,
			create_fragment$7,
			not_equal,
			{
				date: 0,
				metadata: 8,
				onHover: 1,
				onClick: 2,
				onContextMenu: 3,
				today: 4,
				displayedMonth: 5,
				selectedId: 6,
				compact: 7
			},
			add_css$7
		);
	}
}

const emptyMetadata = {
    classes: [],
    dataAttributes: {},
    dots: [],
};
async function combineMetadata(providers, date) {
    const metadata = await Promise.all(providers.map((provider) => provider(date)));
    return metadata.reduce((combined, entry) => ({
        classes: [...combined.classes, ...(entry.classes || [])],
        dataAttributes: Object.assign(combined.dataAttributes, entry.dataAttributes),
        dots: [...combined.dots, ...(entry.dots || [])],
    }), Object.assign(Object.assign({}, emptyMetadata), { dataAttributes: {} }));
}
function getDailyMetadata(sources, date) {
    const providers = [];
    sources.forEach((source) => {
        if (source.getDailyMetadata) {
            providers.push(source.getDailyMetadata);
        }
    });
    return combineMetadata(providers, date);
}
function getWeeklyMetadata(sources, date) {
    const providers = [];
    sources.forEach((source) => {
        if (source.getWeeklyMetadata) {
            providers.push(source.getWeeklyMetadata);
        }
    });
    return combineMetadata(providers, date);
}

/* src/ui/isolatedCalendar/WeekNum.svelte generated by Svelte v3.59.2 */

function add_css$6(target) {
	append_styles(target, "svelte-10j9w0s", "td.svelte-10j9w0s.svelte-10j9w0s{border-right:1px solid var(--background-modifier-border)}.week-num.svelte-10j9w0s.svelte-10j9w0s{background-color:var(--color-background-weeknum);border-radius:4px;color:var(--color-text-weeknum);cursor:pointer;font-size:0.65em;height:100%;padding:4px;text-align:center;transition:background-color 0.1s ease-in, color 0.1s ease-in;vertical-align:baseline}.week-num.svelte-10j9w0s.svelte-10j9w0s:hover{background-color:var(--interactive-hover)}.week-num.active.svelte-10j9w0s.svelte-10j9w0s:hover{background-color:var(--interactive-accent-hover)}.active.svelte-10j9w0s.svelte-10j9w0s{background-color:var(--interactive-accent);color:var(--text-on-accent)}.dot-container.svelte-10j9w0s.svelte-10j9w0s{display:flex;flex-wrap:wrap;justify-content:center;line-height:6px;min-height:6px}.week-num.compact.svelte-10j9w0s.svelte-10j9w0s{font-size:0.55em;padding:2px 0}.week-num.compact.svelte-10j9w0s .dot-container.svelte-10j9w0s{line-height:4px;min-height:4px}");
}

function get_each_context$2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[13] = list[i];
	return child_ctx;
}

// (37:8) {#each metadata.dots as dot}
function create_each_block$2(ctx) {
	let dot;
	let current;

	const dot_spread_levels = [
		/*dot*/ ctx[13],
		{
			isActive: /*selectedId*/ ctx[6] === getCalendarWeekUID(/*days*/ ctx[1][0], /*weekStart*/ ctx[2])
		}
	];

	let dot_props = {};

	for (let i = 0; i < dot_spread_levels.length; i += 1) {
		dot_props = assign(dot_props, dot_spread_levels[i]);
	}

	dot = new Dot({ props: dot_props });

	return {
		c() {
			create_component(dot.$$.fragment);
		},
		m(target, anchor) {
			mount_component(dot, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const dot_changes = (dirty & /*metadata, selectedId, getCalendarWeekUID, days, weekStart*/ 326)
			? get_spread_update(dot_spread_levels, [
					dirty & /*metadata*/ 256 && get_spread_object(/*dot*/ ctx[13]),
					dirty & /*selectedId, getCalendarWeekUID, days, weekStart*/ 70 && {
						isActive: /*selectedId*/ ctx[6] === getCalendarWeekUID(/*days*/ ctx[1][0], /*weekStart*/ ctx[2])
					}
				])
			: {};

			dot.$set(dot_changes);
		},
		i(local) {
			if (current) return;
			transition_in(dot.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(dot.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(dot, detaching);
		}
	};
}

// (23:2) <MetadataResolver {metadata} let:metadata>
function create_default_slot(ctx) {
	let div1;
	let t0;
	let t1;
	let div0;
	let div1_class_value;
	let current;
	let mounted;
	let dispose;
	let each_value = /*metadata*/ ctx[8].dots;
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	let div1_levels = [
		{
			class: div1_class_value = `week-num ${/*metadata*/ ctx[8].classes.join(" ")}`
		},
		/*metadata*/ ctx[8].dataAttributes
	];

	let div_data_1 = {};

	for (let i = 0; i < div1_levels.length; i += 1) {
		div_data_1 = assign(div_data_1, div1_levels[i]);
	}

	return {
		c() {
			div1 = element("div");
			t0 = text(/*weekNum*/ ctx[0]);
			t1 = space();
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(div0, "class", "dot-container svelte-10j9w0s");
			set_attributes(div1, div_data_1);
			toggle_class(div1, "active", /*selectedId*/ ctx[6] === getCalendarWeekUID(/*days*/ ctx[1][0], /*weekStart*/ ctx[2]));
			toggle_class(div1, "compact", /*compact*/ ctx[7]);
			toggle_class(div1, "svelte-10j9w0s", true);
		},
		m(target, anchor) {
			insert(target, div1, anchor);
			append(div1, t0);
			append(div1, t1);
			append(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}

			current = true;

			if (!mounted) {
				dispose = [
					listen(div1, "click", function () {
						if (is_function(/*onClick*/ ctx[4] && /*click_handler*/ ctx[10])) (/*onClick*/ ctx[4] && /*click_handler*/ ctx[10]).apply(this, arguments);
					}),
					listen(div1, "contextmenu", function () {
						if (is_function(/*onContextMenu*/ ctx[5] && /*contextmenu_handler*/ ctx[11])) (/*onContextMenu*/ ctx[5] && /*contextmenu_handler*/ ctx[11]).apply(this, arguments);
					}),
					listen(div1, "pointerover", function () {
						if (is_function(/*onHover*/ ctx[3] && /*pointerover_handler*/ ctx[12])) (/*onHover*/ ctx[3] && /*pointerover_handler*/ ctx[12]).apply(this, arguments);
					})
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (!current || dirty & /*weekNum*/ 1) set_data_maybe_contenteditable(t0, /*weekNum*/ ctx[0], div_data_1['contenteditable']);

			if (dirty & /*metadata, selectedId, getCalendarWeekUID, days, weekStart*/ 326) {
				each_value = /*metadata*/ ctx[8].dots;
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$2(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block$2(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(div0, null);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}

			set_attributes(div1, div_data_1 = get_spread_update(div1_levels, [
				(!current || dirty & /*metadata*/ 256 && div1_class_value !== (div1_class_value = `week-num ${/*metadata*/ ctx[8].classes.join(" ")}`)) && { class: div1_class_value },
				dirty & /*metadata*/ 256 && /*metadata*/ ctx[8].dataAttributes
			]));

			toggle_class(div1, "active", /*selectedId*/ ctx[6] === getCalendarWeekUID(/*days*/ ctx[1][0], /*weekStart*/ ctx[2]));
			toggle_class(div1, "compact", /*compact*/ ctx[7]);
			toggle_class(div1, "svelte-10j9w0s", true);
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(div1);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment$6(ctx) {
	let td;
	let metadataresolver;
	let current;

	metadataresolver = new MetadataResolver({
			props: {
				metadata: /*metadata*/ ctx[8],
				$$slots: {
					default: [
						create_default_slot,
						({ metadata }) => ({ 8: metadata }),
						({ metadata }) => metadata ? 256 : 0
					]
				},
				$$scope: { ctx }
			}
		});

	return {
		c() {
			td = element("td");
			create_component(metadataresolver.$$.fragment);
			attr(td, "class", "svelte-10j9w0s");
		},
		m(target, anchor) {
			insert(target, td, anchor);
			mount_component(metadataresolver, td, null);
			current = true;
		},
		p(ctx, [dirty]) {
			const metadataresolver_changes = {};
			if (dirty & /*metadata*/ 256) metadataresolver_changes.metadata = /*metadata*/ ctx[8];

			if (dirty & /*$$scope, metadata, selectedId, days, weekStart, compact, onClick, startOfWeek, onContextMenu, onHover, weekNum*/ 66559) {
				metadataresolver_changes.$$scope = { dirty, ctx };
			}

			metadataresolver.$set(metadataresolver_changes);
		},
		i(local) {
			if (current) return;
			transition_in(metadataresolver.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(metadataresolver.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(td);
			destroy_component(metadataresolver);
		}
	};
}

function isMetaPressed(event) {
	return navigator.platform.includes("Mac")
	? event.metaKey
	: event.ctrlKey;
}

function instance$6($$self, $$props, $$invalidate) {
	let { weekNum } = $$props;
	let { days } = $$props;
	let { metadata } = $$props;
	let { weekStart } = $$props;
	let { onHover } = $$props;
	let { onClick } = $$props;
	let { onContextMenu } = $$props;
	let { selectedId = null } = $$props;
	let { compact = false } = $$props;
	let startOfWeek;
	const click_handler = event => onClick(startOfWeek, isMetaPressed(event));
	const contextmenu_handler = event => onContextMenu(days[0], event);
	const pointerover_handler = event => onHover(startOfWeek, event.target, isMetaPressed(event));

	$$self.$$set = $$props => {
		if ('weekNum' in $$props) $$invalidate(0, weekNum = $$props.weekNum);
		if ('days' in $$props) $$invalidate(1, days = $$props.days);
		if ('metadata' in $$props) $$invalidate(8, metadata = $$props.metadata);
		if ('weekStart' in $$props) $$invalidate(2, weekStart = $$props.weekStart);
		if ('onHover' in $$props) $$invalidate(3, onHover = $$props.onHover);
		if ('onClick' in $$props) $$invalidate(4, onClick = $$props.onClick);
		if ('onContextMenu' in $$props) $$invalidate(5, onContextMenu = $$props.onContextMenu);
		if ('selectedId' in $$props) $$invalidate(6, selectedId = $$props.selectedId);
		if ('compact' in $$props) $$invalidate(7, compact = $$props.compact);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*days, weekStart*/ 6) {
			$$invalidate(9, startOfWeek = getCalendarWeekStart(days[0], weekStart));
		}
	};

	return [
		weekNum,
		days,
		weekStart,
		onHover,
		onClick,
		onContextMenu,
		selectedId,
		compact,
		metadata,
		startOfWeek,
		click_handler,
		contextmenu_handler,
		pointerover_handler
	];
}

class WeekNum extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$6,
			create_fragment$6,
			not_equal,
			{
				weekNum: 0,
				days: 1,
				metadata: 8,
				weekStart: 2,
				onHover: 3,
				onClick: 4,
				onContextMenu: 5,
				selectedId: 6,
				compact: 7
			},
			add_css$6
		);
	}
}

/* src/ui/isolatedCalendar/MonthGrid.svelte generated by Svelte v3.59.2 */

function add_css$5(target) {
	append_styles(target, "svelte-xgbwtg", ".calendar.svelte-xgbwtg.svelte-xgbwtg{border-collapse:collapse;width:100%}th.svelte-xgbwtg.svelte-xgbwtg{background-color:var(--color-background-heading);color:var(--color-text-heading);font-size:0.6em;letter-spacing:1px;padding:4px;text-align:center;text-transform:uppercase}.weekend.svelte-xgbwtg.svelte-xgbwtg{background-color:var(--color-background-weekend)}.empty.svelte-xgbwtg.svelte-xgbwtg{padding:0}.compact.svelte-xgbwtg.svelte-xgbwtg{font-size:0.88em;table-layout:fixed}.compact.svelte-xgbwtg th.svelte-xgbwtg{font-size:0.55em;letter-spacing:0;padding:2px 0}");
}

function get_each_context$1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[20] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[26] = list[i];
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

// (41:4) {#if showWeekNums}
function create_if_block_3(ctx) {
	let col;

	return {
		c() {
			col = element("col");
		},
		m(target, anchor) {
			insert(target, col, anchor);
		},
		d(detaching) {
			if (detaching) detach(col);
		}
	};
}

// (44:4) {#each month[0].days as date}
function create_each_block_3(ctx) {
	let col;

	return {
		c() {
			col = element("col");
			attr(col, "class", "svelte-xgbwtg");
			toggle_class(col, "weekend", isWeekend(/*date*/ ctx[23]));
		},
		m(target, anchor) {
			insert(target, col, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*isWeekend, month*/ 1) {
				toggle_class(col, "weekend", isWeekend(/*date*/ ctx[23]));
			}
		},
		d(detaching) {
			if (detaching) detach(col);
		}
	};
}

// (50:6) {#if showWeekNums}
function create_if_block_2(ctx) {
	let th;

	return {
		c() {
			th = element("th");
			th.textContent = "W";
			attr(th, "scope", "col");
			attr(th, "class", "svelte-xgbwtg");
		},
		m(target, anchor) {
			insert(target, th, anchor);
		},
		d(detaching) {
			if (detaching) detach(th);
		}
	};
}

// (53:6) {#each daysOfWeek as dayOfWeek}
function create_each_block_2(ctx) {
	let th;
	let t_value = /*dayOfWeek*/ ctx[26] + "";
	let t;

	return {
		c() {
			th = element("th");
			t = text(t_value);
			attr(th, "scope", "col");
			attr(th, "class", "svelte-xgbwtg");
		},
		m(target, anchor) {
			insert(target, th, anchor);
			append(th, t);
		},
		p(ctx, dirty) {
			if (dirty & /*daysOfWeek*/ 8 && t_value !== (t_value = /*dayOfWeek*/ ctx[26] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(th);
		}
	};
}

// (61:8) {#if showWeekNums}
function create_if_block_1(ctx) {
	let weeknum;
	let current;

	const weeknum_spread_levels = [
		/*week*/ ctx[20],
		{ weekStart: /*weekStart*/ ctx[5] },
		{
			metadata: /*getWeekMetadata*/ ctx[16](/*week*/ ctx[20].days[0])
		},
		{ onClick: /*onClickWeek*/ ctx[14] },
		{
			onContextMenu: /*onContextMenuWeek*/ ctx[12]
		},
		{ onHover: /*onHoverWeek*/ ctx[10] },
		{ selectedId: /*selectedId*/ ctx[4] },
		{ compact: /*compact*/ ctx[7] }
	];

	let weeknum_props = {};

	for (let i = 0; i < weeknum_spread_levels.length; i += 1) {
		weeknum_props = assign(weeknum_props, weeknum_spread_levels[i]);
	}

	weeknum = new WeekNum({ props: weeknum_props });

	return {
		c() {
			create_component(weeknum.$$.fragment);
		},
		m(target, anchor) {
			mount_component(weeknum, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const weeknum_changes = (dirty & /*month, weekStart, getWeekMetadata, onClickWeek, onContextMenuWeek, onHoverWeek, selectedId, compact*/ 87217)
			? get_spread_update(weeknum_spread_levels, [
					dirty & /*month*/ 1 && get_spread_object(/*week*/ ctx[20]),
					dirty & /*weekStart*/ 32 && { weekStart: /*weekStart*/ ctx[5] },
					dirty & /*getWeekMetadata, month*/ 65537 && {
						metadata: /*getWeekMetadata*/ ctx[16](/*week*/ ctx[20].days[0])
					},
					dirty & /*onClickWeek*/ 16384 && { onClick: /*onClickWeek*/ ctx[14] },
					dirty & /*onContextMenuWeek*/ 4096 && {
						onContextMenu: /*onContextMenuWeek*/ ctx[12]
					},
					dirty & /*onHoverWeek*/ 1024 && { onHover: /*onHoverWeek*/ ctx[10] },
					dirty & /*selectedId*/ 16 && { selectedId: /*selectedId*/ ctx[4] },
					dirty & /*compact*/ 128 && { compact: /*compact*/ ctx[7] }
				])
			: {};

			weeknum.$set(weeknum_changes);
		},
		i(local) {
			if (current) return;
			transition_in(weeknum.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(weeknum.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(weeknum, detaching);
		}
	};
}

// (76:10) {:else}
function create_else_block$1(ctx) {
	let day;
	let current;

	day = new Day({
			props: {
				date: /*date*/ ctx[23],
				today: /*today*/ ctx[2],
				displayedMonth: /*displayedMonth*/ ctx[1],
				metadata: /*getDayMetadata*/ ctx[15](/*date*/ ctx[23]),
				onClick: /*onClickDay*/ ctx[13],
				onContextMenu: /*onContextMenuDay*/ ctx[11],
				onHover: /*onHoverDay*/ ctx[9],
				selectedId: /*selectedId*/ ctx[4],
				compact: /*compact*/ ctx[7]
			}
		});

	return {
		c() {
			create_component(day.$$.fragment);
		},
		m(target, anchor) {
			mount_component(day, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const day_changes = {};
			if (dirty & /*month*/ 1) day_changes.date = /*date*/ ctx[23];
			if (dirty & /*today*/ 4) day_changes.today = /*today*/ ctx[2];
			if (dirty & /*displayedMonth*/ 2) day_changes.displayedMonth = /*displayedMonth*/ ctx[1];
			if (dirty & /*month*/ 1) day_changes.metadata = /*getDayMetadata*/ ctx[15](/*date*/ ctx[23]);
			if (dirty & /*onClickDay*/ 8192) day_changes.onClick = /*onClickDay*/ ctx[13];
			if (dirty & /*onContextMenuDay*/ 2048) day_changes.onContextMenu = /*onContextMenuDay*/ ctx[11];
			if (dirty & /*onHoverDay*/ 512) day_changes.onHover = /*onHoverDay*/ ctx[9];
			if (dirty & /*selectedId*/ 16) day_changes.selectedId = /*selectedId*/ ctx[4];
			if (dirty & /*compact*/ 128) day_changes.compact = /*compact*/ ctx[7];
			day.$set(day_changes);
		},
		i(local) {
			if (current) return;
			transition_in(day.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(day.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(day, detaching);
		}
	};
}

// (74:10) {#if hideAdjacentMonths && !date.isSame(displayedMonth, "month")}
function create_if_block$2(ctx) {
	let td;

	return {
		c() {
			td = element("td");
			attr(td, "class", "empty svelte-xgbwtg");
			attr(td, "aria-hidden", "true");
		},
		m(target, anchor) {
			insert(target, td, anchor);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(td);
		}
	};
}

// (73:8) {#each week.days as date (date.format())}
function create_each_block_1(key_1, ctx) {
	let first;
	let show_if;
	let current_block_type_index;
	let if_block;
	let if_block_anchor;
	let current;
	const if_block_creators = [create_if_block$2, create_else_block$1];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (dirty & /*hideAdjacentMonths, month, displayedMonth*/ 259) show_if = null;
		if (show_if == null) show_if = !!(/*hideAdjacentMonths*/ ctx[8] && !/*date*/ ctx[23].isSame(/*displayedMonth*/ ctx[1], "month"));
		if (show_if) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx, -1);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		key: key_1,
		first: null,
		c() {
			first = empty();
			if_block.c();
			if_block_anchor = empty();
			this.first = first;
		},
		m(target, anchor) {
			insert(target, first, anchor);
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx, dirty);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(if_block_anchor.parentNode, if_block_anchor);
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(first);
			if_blocks[current_block_type_index].d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

// (59:4) {#each month as week (week.days[0].format())}
function create_each_block$1(key_1, ctx) {
	let tr;
	let t0;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let t1;
	let current;
	let if_block = /*showWeekNums*/ ctx[6] && create_if_block_1(ctx);
	let each_value_1 = /*week*/ ctx[20].days;
	const get_key = ctx => /*date*/ ctx[23].format();

	for (let i = 0; i < each_value_1.length; i += 1) {
		let child_ctx = get_each_context_1(ctx, each_value_1, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block_1(key, child_ctx));
	}

	return {
		key: key_1,
		first: null,
		c() {
			tr = element("tr");
			if (if_block) if_block.c();
			t0 = space();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t1 = space();
			this.first = tr;
		},
		m(target, anchor) {
			insert(target, tr, anchor);
			if (if_block) if_block.m(tr, null);
			append(tr, t0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(tr, null);
				}
			}

			append(tr, t1);
			current = true;
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (/*showWeekNums*/ ctx[6]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty & /*showWeekNums*/ 64) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block_1(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(tr, t0);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}

			if (dirty & /*hideAdjacentMonths, month, displayedMonth, today, getDayMetadata, onClickDay, onContextMenuDay, onHoverDay, selectedId, compact*/ 43927) {
				each_value_1 = /*week*/ ctx[20].days;
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value_1, each_1_lookup, tr, outro_and_destroy_block, create_each_block_1, t1, get_each_context_1);
				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);

			for (let i = 0; i < each_value_1.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			transition_out(if_block);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(tr);
			if (if_block) if_block.d();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}
		}
	};
}

function create_fragment$5(ctx) {
	let table;
	let colgroup;
	let t0;
	let t1;
	let thead;
	let tr;
	let t2;
	let t3;
	let tbody;
	let each_blocks = [];
	let each2_lookup = new Map();
	let table_aria_label_value;
	let current;
	let if_block0 = /*showWeekNums*/ ctx[6] && create_if_block_3();
	let each_value_3 = /*month*/ ctx[0][0].days;
	let each_blocks_2 = [];

	for (let i = 0; i < each_value_3.length; i += 1) {
		each_blocks_2[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	let if_block1 = /*showWeekNums*/ ctx[6] && create_if_block_2();
	let each_value_2 = /*daysOfWeek*/ ctx[3];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks_1[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	let each_value = /*month*/ ctx[0];
	const get_key = ctx => /*week*/ ctx[20].days[0].format();

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context$1(ctx, each_value, i);
		let key = get_key(child_ctx);
		each2_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
	}

	return {
		c() {
			table = element("table");
			colgroup = element("colgroup");
			if (if_block0) if_block0.c();
			t0 = space();

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].c();
			}

			t1 = space();
			thead = element("thead");
			tr = element("tr");
			if (if_block1) if_block1.c();
			t2 = space();

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t3 = space();
			tbody = element("tbody");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(table, "class", "calendar svelte-xgbwtg");
			attr(table, "aria-label", table_aria_label_value = /*displayedMonth*/ ctx[1].format("MMMM YYYY"));
			toggle_class(table, "compact", /*compact*/ ctx[7]);
		},
		m(target, anchor) {
			insert(target, table, anchor);
			append(table, colgroup);
			if (if_block0) if_block0.m(colgroup, null);
			append(colgroup, t0);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				if (each_blocks_2[i]) {
					each_blocks_2[i].m(colgroup, null);
				}
			}

			append(table, t1);
			append(table, thead);
			append(thead, tr);
			if (if_block1) if_block1.m(tr, null);
			append(tr, t2);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(tr, null);
				}
			}

			append(table, t3);
			append(table, tbody);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(tbody, null);
				}
			}

			current = true;
		},
		p(ctx, [dirty]) {
			if (/*showWeekNums*/ ctx[6]) {
				if (if_block0) ; else {
					if_block0 = create_if_block_3();
					if_block0.c();
					if_block0.m(colgroup, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty & /*isWeekend, month*/ 1) {
				each_value_3 = /*month*/ ctx[0][0].days;
				let i;

				for (i = 0; i < each_value_3.length; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks_2[i]) {
						each_blocks_2[i].p(child_ctx, dirty);
					} else {
						each_blocks_2[i] = create_each_block_3(child_ctx);
						each_blocks_2[i].c();
						each_blocks_2[i].m(colgroup, null);
					}
				}

				for (; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].d(1);
				}

				each_blocks_2.length = each_value_3.length;
			}

			if (/*showWeekNums*/ ctx[6]) {
				if (if_block1) ; else {
					if_block1 = create_if_block_2();
					if_block1.c();
					if_block1.m(tr, t2);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (dirty & /*daysOfWeek*/ 8) {
				each_value_2 = /*daysOfWeek*/ ctx[3];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_2(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(tr, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_2.length;
			}

			if (dirty & /*month, hideAdjacentMonths, displayedMonth, today, getDayMetadata, onClickDay, onContextMenuDay, onHoverDay, selectedId, compact, weekStart, getWeekMetadata, onClickWeek, onContextMenuWeek, onHoverWeek, showWeekNums*/ 131063) {
				each_value = /*month*/ ctx[0];
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each2_lookup, tbody, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
				check_outros();
			}

			if (!current || dirty & /*displayedMonth*/ 2 && table_aria_label_value !== (table_aria_label_value = /*displayedMonth*/ ctx[1].format("MMMM YYYY"))) {
				attr(table, "aria-label", table_aria_label_value);
			}

			if (!current || dirty & /*compact*/ 128) {
				toggle_class(table, "compact", /*compact*/ ctx[7]);
			}
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(table);
			if (if_block0) if_block0.d();
			destroy_each(each_blocks_2, detaching);
			if (if_block1) if_block1.d();
			destroy_each(each_blocks_1, detaching);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}
		}
	};
}

function instance$5($$self, $$props, $$invalidate) {
	let { month } = $$props;
	let { displayedMonth } = $$props;
	let { today } = $$props;
	let { daysOfWeek } = $$props;
	let { sources = [] } = $$props;
	let { selectedId } = $$props;
	let { weekStart } = $$props;
	let { showWeekNums = false } = $$props;
	let { compact = false } = $$props;
	let { hideAdjacentMonths = false } = $$props;
	let { dailyMetadataForDate = null } = $$props;
	let { weeklyMetadataForDate = null } = $$props;
	let { onHoverDay } = $$props;
	let { onHoverWeek } = $$props;
	let { onContextMenuDay } = $$props;
	let { onContextMenuWeek } = $$props;
	let { onClickDay } = $$props;
	let { onClickWeek } = $$props;

	function getDayMetadata(date) {
		return dailyMetadataForDate
		? dailyMetadataForDate(date)
		: getDailyMetadata(sources, date);
	}

	function getWeekMetadata(date) {
		return weeklyMetadataForDate
		? weeklyMetadataForDate(date)
		: getWeeklyMetadata(sources, date);
	}

	$$self.$$set = $$props => {
		if ('month' in $$props) $$invalidate(0, month = $$props.month);
		if ('displayedMonth' in $$props) $$invalidate(1, displayedMonth = $$props.displayedMonth);
		if ('today' in $$props) $$invalidate(2, today = $$props.today);
		if ('daysOfWeek' in $$props) $$invalidate(3, daysOfWeek = $$props.daysOfWeek);
		if ('sources' in $$props) $$invalidate(17, sources = $$props.sources);
		if ('selectedId' in $$props) $$invalidate(4, selectedId = $$props.selectedId);
		if ('weekStart' in $$props) $$invalidate(5, weekStart = $$props.weekStart);
		if ('showWeekNums' in $$props) $$invalidate(6, showWeekNums = $$props.showWeekNums);
		if ('compact' in $$props) $$invalidate(7, compact = $$props.compact);
		if ('hideAdjacentMonths' in $$props) $$invalidate(8, hideAdjacentMonths = $$props.hideAdjacentMonths);
		if ('dailyMetadataForDate' in $$props) $$invalidate(18, dailyMetadataForDate = $$props.dailyMetadataForDate);
		if ('weeklyMetadataForDate' in $$props) $$invalidate(19, weeklyMetadataForDate = $$props.weeklyMetadataForDate);
		if ('onHoverDay' in $$props) $$invalidate(9, onHoverDay = $$props.onHoverDay);
		if ('onHoverWeek' in $$props) $$invalidate(10, onHoverWeek = $$props.onHoverWeek);
		if ('onContextMenuDay' in $$props) $$invalidate(11, onContextMenuDay = $$props.onContextMenuDay);
		if ('onContextMenuWeek' in $$props) $$invalidate(12, onContextMenuWeek = $$props.onContextMenuWeek);
		if ('onClickDay' in $$props) $$invalidate(13, onClickDay = $$props.onClickDay);
		if ('onClickWeek' in $$props) $$invalidate(14, onClickWeek = $$props.onClickWeek);
	};

	return [
		month,
		displayedMonth,
		today,
		daysOfWeek,
		selectedId,
		weekStart,
		showWeekNums,
		compact,
		hideAdjacentMonths,
		onHoverDay,
		onHoverWeek,
		onContextMenuDay,
		onContextMenuWeek,
		onClickDay,
		onClickWeek,
		getDayMetadata,
		getWeekMetadata,
		sources,
		dailyMetadataForDate,
		weeklyMetadataForDate
	];
}

class MonthGrid extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$5,
			create_fragment$5,
			not_equal,
			{
				month: 0,
				displayedMonth: 1,
				today: 2,
				daysOfWeek: 3,
				sources: 17,
				selectedId: 4,
				weekStart: 5,
				showWeekNums: 6,
				compact: 7,
				hideAdjacentMonths: 8,
				dailyMetadataForDate: 18,
				weeklyMetadataForDate: 19,
				onHoverDay: 9,
				onHoverWeek: 10,
				onContextMenuDay: 11,
				onContextMenuWeek: 12,
				onClickDay: 13,
				onClickWeek: 14
			},
			add_css$5
		);
	}
}

/* src/ui/isolatedCalendar/Arrow.svelte generated by Svelte v3.59.2 */

function add_css$4(target) {
	append_styles(target, "svelte-108dnd", ".arrow.svelte-108dnd.svelte-108dnd{align-items:center;background:none;border:0;color:inherit;cursor:pointer;display:flex;justify-content:center;padding:0;width:24px}.arrow.is-mobile.svelte-108dnd.svelte-108dnd{width:32px}.right.svelte-108dnd.svelte-108dnd{transform:rotate(180deg)}.arrow.svelte-108dnd svg.svelte-108dnd{color:var(--color-arrow);height:16px;width:16px}");
}

function create_fragment$4(ctx) {
	let button;
	let svg;
	let path;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			svg = svg_element("svg");
			path = svg_element("path");
			attr(path, "fill", "currentColor");
			attr(path, "d", "M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z");
			attr(svg, "focusable", "false");
			attr(svg, "role", "img");
			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
			attr(svg, "viewBox", "0 0 320 512");
			attr(svg, "class", "svelte-108dnd");
			attr(button, "class", "arrow svelte-108dnd");
			attr(button, "aria-label", /*tooltip*/ ctx[1]);
			attr(button, "type", "button");
			toggle_class(button, "is-mobile", /*isMobile*/ ctx[3]);
			toggle_class(button, "right", /*direction*/ ctx[2] === "right");
		},
		m(target, anchor) {
			insert(target, button, anchor);
			append(button, svg);
			append(svg, path);

			if (!mounted) {
				dispose = listen(button, "click", function () {
					if (is_function(/*onClick*/ ctx[0])) /*onClick*/ ctx[0].apply(this, arguments);
				});

				mounted = true;
			}
		},
		p(new_ctx, [dirty]) {
			ctx = new_ctx;

			if (dirty & /*tooltip*/ 2) {
				attr(button, "aria-label", /*tooltip*/ ctx[1]);
			}

			if (dirty & /*direction*/ 4) {
				toggle_class(button, "right", /*direction*/ ctx[2] === "right");
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

function instance$4($$self, $$props, $$invalidate) {
	let { onClick } = $$props;
	let { tooltip } = $$props;
	let { direction } = $$props;
	let isMobile = Boolean(window.app.isMobile);

	$$self.$$set = $$props => {
		if ('onClick' in $$props) $$invalidate(0, onClick = $$props.onClick);
		if ('tooltip' in $$props) $$invalidate(1, tooltip = $$props.tooltip);
		if ('direction' in $$props) $$invalidate(2, direction = $$props.direction);
	};

	return [onClick, tooltip, direction, isMobile];
}

class Arrow extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$4, create_fragment$4, safe_not_equal, { onClick: 0, tooltip: 1, direction: 2 }, add_css$4);
	}
}

/* src/ui/isolatedCalendar/Nav.svelte generated by Svelte v3.59.2 */

function add_css$3(target) {
	append_styles(target, "svelte-14uv0dj", ".nav.svelte-14uv0dj.svelte-14uv0dj{align-items:center;display:flex;margin:0.6em 0 1em;padding:0 8px;width:100%}.nav.is-mobile.svelte-14uv0dj.svelte-14uv0dj{padding:0}.title.svelte-14uv0dj.svelte-14uv0dj{color:var(--color-text-title);cursor:pointer;font-size:1.5em;margin:0}.is-mobile.svelte-14uv0dj .title.svelte-14uv0dj{font-size:1.3em}.month.svelte-14uv0dj.svelte-14uv0dj{font-weight:500;text-transform:capitalize}.year.svelte-14uv0dj.svelte-14uv0dj{color:var(--interactive-accent)}.right-nav.svelte-14uv0dj.svelte-14uv0dj{display:flex;justify-content:center;margin-left:auto}.reset-button.svelte-14uv0dj.svelte-14uv0dj{background:none;border:0;border-radius:4px;color:var(--text-muted);cursor:pointer;font-size:0.7em;font-weight:600;letter-spacing:1px;margin:0 4px;padding:0 4px;text-transform:uppercase}.view-toggle.svelte-14uv0dj.svelte-14uv0dj{background:none;border:1px solid var(--background-modifier-border);border-radius:4px;color:var(--text-muted);cursor:pointer;font-size:0.7em;font-weight:600;letter-spacing:0.4px;margin-left:0.4em;padding:0.1em 0.45em;text-transform:uppercase}.view-toggle.svelte-14uv0dj.svelte-14uv0dj:hover{background:var(--interactive-hover)}.view-toggle.svelte-14uv0dj.svelte-14uv0dj:focus-visible{outline:2px solid var(--interactive-accent);outline-offset:2px}.is-mobile.svelte-14uv0dj .reset-button.svelte-14uv0dj{display:none}");
}

// (41:4) {#if viewMode === "month"}
function create_if_block$1(ctx) {
	let span;
	let t_value = /*localizedDisplayedMonth*/ ctx[5].format("MMM") + "";
	let t;

	return {
		c() {
			span = element("span");
			t = text(t_value);
			attr(span, "class", "month svelte-14uv0dj");
		},
		m(target, anchor) {
			insert(target, span, anchor);
			append(span, t);
		},
		p(ctx, dirty) {
			if (dirty & /*localizedDisplayedMonth*/ 32 && t_value !== (t_value = /*localizedDisplayedMonth*/ ctx[5].format("MMM") + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(span);
		}
	};
}

function create_fragment$3(ctx) {
	let div1;
	let h3;
	let t0;
	let span;
	let t1_value = /*localizedDisplayedMonth*/ ctx[5].format("YYYY") + "";
	let t1;
	let h3_aria_label_value;
	let t2;
	let div0;
	let arrow0;
	let t3;
	let button0;
	let t4;
	let t5;
	let arrow1;
	let t6;
	let button1;
	let t7;
	let button1_aria_label_value;
	let button1_aria_pressed_value;
	let current;
	let mounted;
	let dispose;
	let if_block = /*viewMode*/ ctx[0] === "month" && create_if_block$1(ctx);

	arrow0 = new Arrow({
			props: {
				direction: "left",
				onClick: /*decrementDisplayedMonth*/ ctx[3],
				tooltip: `Previous ${/*navigationUnit*/ ctx[7]}`
			}
		});

	arrow1 = new Arrow({
			props: {
				direction: "right",
				onClick: /*incrementDisplayedMonth*/ ctx[2],
				tooltip: `Next ${/*navigationUnit*/ ctx[7]}`
			}
		});

	return {
		c() {
			div1 = element("div");
			h3 = element("h3");
			if (if_block) if_block.c();
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			div0 = element("div");
			create_component(arrow0.$$.fragment);
			t3 = space();
			button0 = element("button");
			t4 = text(/*todayDisplayText*/ ctx[6]);
			t5 = space();
			create_component(arrow1.$$.fragment);
			t6 = space();
			button1 = element("button");
			t7 = text(/*alternateView*/ ctx[8]);
			attr(span, "class", "year svelte-14uv0dj");
			attr(h3, "class", "title svelte-14uv0dj");
			attr(h3, "role", "button");
			attr(h3, "tabindex", "0");
			attr(h3, "aria-label", h3_aria_label_value = `Show current ${/*navigationUnit*/ ctx[7]}`);
			attr(button0, "class", "reset-button svelte-14uv0dj");
			attr(button0, "type", "button");
			attr(button1, "class", "view-toggle svelte-14uv0dj");
			attr(button1, "aria-label", button1_aria_label_value = `Switch to ${/*alternateView*/ ctx[8].toLowerCase()} view`);
			attr(button1, "aria-pressed", button1_aria_pressed_value = /*viewMode*/ ctx[0] === "year");
			attr(button1, "type", "button");
			attr(div0, "class", "right-nav svelte-14uv0dj");
			attr(div1, "class", "nav svelte-14uv0dj");
			toggle_class(div1, "is-mobile", /*isMobile*/ ctx[9]);
		},
		m(target, anchor) {
			insert(target, div1, anchor);
			append(div1, h3);
			if (if_block) if_block.m(h3, null);
			append(h3, t0);
			append(h3, span);
			append(span, t1);
			append(div1, t2);
			append(div1, div0);
			mount_component(arrow0, div0, null);
			append(div0, t3);
			append(div0, button0);
			append(button0, t4);
			append(div0, t5);
			mount_component(arrow1, div0, null);
			append(div0, t6);
			append(div0, button1);
			append(button1, t7);
			current = true;

			if (!mounted) {
				dispose = [
					listen(h3, "click", function () {
						if (is_function(/*resetDisplayedMonth*/ ctx[1])) /*resetDisplayedMonth*/ ctx[1].apply(this, arguments);
					}),
					listen(h3, "keydown", /*resetOnKeyboard*/ ctx[10]),
					listen(button0, "click", function () {
						if (is_function(/*resetDisplayedMonth*/ ctx[1])) /*resetDisplayedMonth*/ ctx[1].apply(this, arguments);
					}),
					listen(button1, "click", function () {
						if (is_function(/*onToggleView*/ ctx[4])) /*onToggleView*/ ctx[4].apply(this, arguments);
					})
				];

				mounted = true;
			}
		},
		p(new_ctx, [dirty]) {
			ctx = new_ctx;

			if (/*viewMode*/ ctx[0] === "month") {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					if_block.m(h3, t0);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if ((!current || dirty & /*localizedDisplayedMonth*/ 32) && t1_value !== (t1_value = /*localizedDisplayedMonth*/ ctx[5].format("YYYY") + "")) set_data(t1, t1_value);

			if (!current || dirty & /*navigationUnit*/ 128 && h3_aria_label_value !== (h3_aria_label_value = `Show current ${/*navigationUnit*/ ctx[7]}`)) {
				attr(h3, "aria-label", h3_aria_label_value);
			}

			const arrow0_changes = {};
			if (dirty & /*decrementDisplayedMonth*/ 8) arrow0_changes.onClick = /*decrementDisplayedMonth*/ ctx[3];
			if (dirty & /*navigationUnit*/ 128) arrow0_changes.tooltip = `Previous ${/*navigationUnit*/ ctx[7]}`;
			arrow0.$set(arrow0_changes);
			if (!current || dirty & /*todayDisplayText*/ 64) set_data(t4, /*todayDisplayText*/ ctx[6]);
			const arrow1_changes = {};
			if (dirty & /*incrementDisplayedMonth*/ 4) arrow1_changes.onClick = /*incrementDisplayedMonth*/ ctx[2];
			if (dirty & /*navigationUnit*/ 128) arrow1_changes.tooltip = `Next ${/*navigationUnit*/ ctx[7]}`;
			arrow1.$set(arrow1_changes);
			if (!current || dirty & /*alternateView*/ 256) set_data(t7, /*alternateView*/ ctx[8]);

			if (!current || dirty & /*alternateView*/ 256 && button1_aria_label_value !== (button1_aria_label_value = `Switch to ${/*alternateView*/ ctx[8].toLowerCase()} view`)) {
				attr(button1, "aria-label", button1_aria_label_value);
			}

			if (!current || dirty & /*viewMode*/ 1 && button1_aria_pressed_value !== (button1_aria_pressed_value = /*viewMode*/ ctx[0] === "year")) {
				attr(button1, "aria-pressed", button1_aria_pressed_value);
			}
		},
		i(local) {
			if (current) return;
			transition_in(arrow0.$$.fragment, local);
			transition_in(arrow1.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(arrow0.$$.fragment, local);
			transition_out(arrow1.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div1);
			if (if_block) if_block.d();
			destroy_component(arrow0);
			destroy_component(arrow1);
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance$3($$self, $$props, $$invalidate) {
	let { displayedMonth } = $$props;
	let { today } = $$props;
	let { locale } = $$props;
	let { viewMode = "month" } = $$props;
	let { resetDisplayedMonth } = $$props;
	let { incrementDisplayedMonth } = $$props;
	let { decrementDisplayedMonth } = $$props;
	let { onToggleView } = $$props;
	let localizedToday;
	let localizedDisplayedMonth;
	let todayDisplayText;
	let navigationUnit;
	let alternateView;
	let isMobile = Boolean(window.app.isMobile);

	function resetOnKeyboard(event) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			resetDisplayedMonth();
		}
	}

	$$self.$$set = $$props => {
		if ('displayedMonth' in $$props) $$invalidate(11, displayedMonth = $$props.displayedMonth);
		if ('today' in $$props) $$invalidate(12, today = $$props.today);
		if ('locale' in $$props) $$invalidate(13, locale = $$props.locale);
		if ('viewMode' in $$props) $$invalidate(0, viewMode = $$props.viewMode);
		if ('resetDisplayedMonth' in $$props) $$invalidate(1, resetDisplayedMonth = $$props.resetDisplayedMonth);
		if ('incrementDisplayedMonth' in $$props) $$invalidate(2, incrementDisplayedMonth = $$props.incrementDisplayedMonth);
		if ('decrementDisplayedMonth' in $$props) $$invalidate(3, decrementDisplayedMonth = $$props.decrementDisplayedMonth);
		if ('onToggleView' in $$props) $$invalidate(4, onToggleView = $$props.onToggleView);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*today, locale*/ 12288) {
			$$invalidate(14, localizedToday = withCalendarLocale(today, locale));
		}

		if ($$self.$$.dirty & /*displayedMonth, locale*/ 10240) {
			$$invalidate(5, localizedDisplayedMonth = withCalendarLocale(displayedMonth, locale));
		}

		if ($$self.$$.dirty & /*localizedToday*/ 16384) {
			$$invalidate(6, todayDisplayText = localizedToday.calendar().split(/\d|\s/)[0]);
		}

		if ($$self.$$.dirty & /*viewMode*/ 1) {
			$$invalidate(7, navigationUnit = viewMode === "year" ? "year" : "month");
		}

		if ($$self.$$.dirty & /*viewMode*/ 1) {
			$$invalidate(8, alternateView = viewMode === "year" ? "Month" : "Year");
		}
	};

	return [
		viewMode,
		resetDisplayedMonth,
		incrementDisplayedMonth,
		decrementDisplayedMonth,
		onToggleView,
		localizedDisplayedMonth,
		todayDisplayText,
		navigationUnit,
		alternateView,
		isMobile,
		resetOnKeyboard,
		displayedMonth,
		today,
		locale,
		localizedToday
	];
}

class Nav extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$3,
			create_fragment$3,
			safe_not_equal,
			{
				displayedMonth: 11,
				today: 12,
				locale: 13,
				viewMode: 0,
				resetDisplayedMonth: 1,
				incrementDisplayedMonth: 2,
				decrementDisplayedMonth: 3,
				onToggleView: 4
			},
			add_css$3
		);
	}
}

/* src/ui/isolatedCalendar/YearCalendar.svelte generated by Svelte v3.59.2 */

const { Map: Map_1 } = globals;

function add_css$2(target) {
	append_styles(target, "svelte-1jujmvk", ".year-calendar.svelte-1jujmvk{display:grid;gap:1.25em;grid-template-columns:repeat(auto-fit, minmax(12rem, 1fr))}.month.svelte-1jujmvk{min-width:0}h4.svelte-1jujmvk{margin:0 0 0.35em;text-align:center}.month-title.svelte-1jujmvk{background:none;border:0;color:var(--color-text-title);cursor:pointer;font:inherit;font-size:0.88em;font-weight:600;padding:0.15em 0.35em}.month-title.svelte-1jujmvk:hover{background:var(--interactive-hover);border-radius:4px}.month-title.svelte-1jujmvk:focus-visible{border-radius:3px;outline:2px solid var(--interactive-accent);outline-offset:2px}");
}

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[26] = list[i];
	return child_ctx;
}

// (62:2) {#each months as calendarMonth (calendarMonth.month.format("YYYY-MM"))}
function create_each_block(key_1, ctx) {
	let section;
	let h4;
	let button;
	let t0_value = /*calendarMonth*/ ctx[26].month.format("MMMM") + "";
	let t0;
	let button_aria_label_value;
	let t1;
	let monthgrid;
	let t2;
	let section_aria_label_value;
	let current;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[23](/*calendarMonth*/ ctx[26]);
	}

	monthgrid = new MonthGrid({
			props: {
				month: /*calendarMonth*/ ctx[26].weeks,
				displayedMonth: /*calendarMonth*/ ctx[26].month,
				today: /*today*/ ctx[1],
				daysOfWeek: /*daysOfWeek*/ ctx[3],
				sources: /*sources*/ ctx[4],
				selectedId: /*selectedId*/ ctx[5],
				weekStart: /*weekStart*/ ctx[2],
				showWeekNums: /*showWeekNums*/ ctx[6],
				compact: true,
				hideAdjacentMonths: true,
				dailyMetadataForDate: /*getCachedDailyMetadata*/ ctx[15],
				weeklyMetadataForDate: /*getCachedWeeklyMetadata*/ ctx[16],
				onHoverDay: /*onHoverDay*/ ctx[7],
				onHoverWeek: /*onHoverWeek*/ ctx[8],
				onContextMenuDay: /*onContextMenuDay*/ ctx[9],
				onContextMenuWeek: /*onContextMenuWeek*/ ctx[10],
				onClickDay: /*onClickDay*/ ctx[11],
				onClickWeek: /*onClickWeek*/ ctx[12]
			}
		});

	return {
		key: key_1,
		first: null,
		c() {
			section = element("section");
			h4 = element("h4");
			button = element("button");
			t0 = text(t0_value);
			t1 = space();
			create_component(monthgrid.$$.fragment);
			t2 = space();
			attr(button, "class", "month-title svelte-1jujmvk");
			attr(button, "aria-label", button_aria_label_value = `Show ${/*calendarMonth*/ ctx[26].month.format("MMMM YYYY")} as a month`);
			attr(button, "type", "button");
			attr(h4, "class", "svelte-1jujmvk");
			attr(section, "class", "month svelte-1jujmvk");
			attr(section, "aria-label", section_aria_label_value = /*calendarMonth*/ ctx[26].month.format("MMMM YYYY"));
			this.first = section;
		},
		m(target, anchor) {
			insert(target, section, anchor);
			append(section, h4);
			append(h4, button);
			append(button, t0);
			append(section, t1);
			mount_component(monthgrid, section, null);
			append(section, t2);
			current = true;

			if (!mounted) {
				dispose = listen(button, "click", click_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if ((!current || dirty & /*months*/ 16384) && t0_value !== (t0_value = /*calendarMonth*/ ctx[26].month.format("MMMM") + "")) set_data(t0, t0_value);

			if (!current || dirty & /*months*/ 16384 && button_aria_label_value !== (button_aria_label_value = `Show ${/*calendarMonth*/ ctx[26].month.format("MMMM YYYY")} as a month`)) {
				attr(button, "aria-label", button_aria_label_value);
			}

			const monthgrid_changes = {};
			if (dirty & /*months*/ 16384) monthgrid_changes.month = /*calendarMonth*/ ctx[26].weeks;
			if (dirty & /*months*/ 16384) monthgrid_changes.displayedMonth = /*calendarMonth*/ ctx[26].month;
			if (dirty & /*today*/ 2) monthgrid_changes.today = /*today*/ ctx[1];
			if (dirty & /*daysOfWeek*/ 8) monthgrid_changes.daysOfWeek = /*daysOfWeek*/ ctx[3];
			if (dirty & /*sources*/ 16) monthgrid_changes.sources = /*sources*/ ctx[4];
			if (dirty & /*selectedId*/ 32) monthgrid_changes.selectedId = /*selectedId*/ ctx[5];
			if (dirty & /*weekStart*/ 4) monthgrid_changes.weekStart = /*weekStart*/ ctx[2];
			if (dirty & /*showWeekNums*/ 64) monthgrid_changes.showWeekNums = /*showWeekNums*/ ctx[6];
			if (dirty & /*onHoverDay*/ 128) monthgrid_changes.onHoverDay = /*onHoverDay*/ ctx[7];
			if (dirty & /*onHoverWeek*/ 256) monthgrid_changes.onHoverWeek = /*onHoverWeek*/ ctx[8];
			if (dirty & /*onContextMenuDay*/ 512) monthgrid_changes.onContextMenuDay = /*onContextMenuDay*/ ctx[9];
			if (dirty & /*onContextMenuWeek*/ 1024) monthgrid_changes.onContextMenuWeek = /*onContextMenuWeek*/ ctx[10];
			if (dirty & /*onClickDay*/ 2048) monthgrid_changes.onClickDay = /*onClickDay*/ ctx[11];
			if (dirty & /*onClickWeek*/ 4096) monthgrid_changes.onClickWeek = /*onClickWeek*/ ctx[12];
			monthgrid.$set(monthgrid_changes);

			if (!current || dirty & /*months*/ 16384 && section_aria_label_value !== (section_aria_label_value = /*calendarMonth*/ ctx[26].month.format("MMMM YYYY"))) {
				attr(section, "aria-label", section_aria_label_value);
			}
		},
		i(local) {
			if (current) return;
			transition_in(monthgrid.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(monthgrid.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(section);
			destroy_component(monthgrid);
			mounted = false;
			dispose();
		}
	};
}

function create_fragment$2(ctx) {
	let div;
	let each_blocks = [];
	let each_1_lookup = new Map_1();
	let div_aria_label_value;
	let current;
	let each_value = /*months*/ ctx[14];
	const get_key = ctx => /*calendarMonth*/ ctx[26].month.format("YYYY-MM");

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(div, "class", "year-calendar svelte-1jujmvk");
			attr(div, "aria-label", div_aria_label_value = `${/*displayedMonth*/ ctx[0].format("YYYY")} calendar`);
		},
		m(target, anchor) {
			insert(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}

			current = true;
		},
		p(ctx, [dirty]) {
			if (dirty & /*months, today, daysOfWeek, sources, selectedId, weekStart, showWeekNums, getCachedDailyMetadata, getCachedWeeklyMetadata, onHoverDay, onHoverWeek, onContextMenuDay, onContextMenuWeek, onClickDay, onClickWeek, onSelectMonth*/ 131070) {
				each_value = /*months*/ ctx[14];
				group_outros();
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div, outro_and_destroy_block, create_each_block, null, get_each_context);
				check_outros();
			}

			if (!current || dirty & /*displayedMonth*/ 1 && div_aria_label_value !== (div_aria_label_value = `${/*displayedMonth*/ ctx[0].format("YYYY")} calendar`)) {
				attr(div, "aria-label", div_aria_label_value);
			}
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let { displayedMonth } = $$props;
	let { today } = $$props;
	let { locale } = $$props;
	let { weekStart } = $$props;
	let { localeFirstDayOfYear } = $$props;
	let { daysOfWeek } = $$props;
	let { sources = [] } = $$props;
	let { selectedId } = $$props;
	let { showWeekNums = false } = $$props;
	let { metadataKey = "" } = $$props;
	let { onHoverDay } = $$props;
	let { onHoverWeek } = $$props;
	let { onContextMenuDay } = $$props;
	let { onContextMenuWeek } = $$props;
	let { onClickDay } = $$props;
	let { onClickWeek } = $$props;
	let { onSelectMonth } = $$props;
	let months = getCalendarYearMonths(displayedMonth, locale, weekStart, localeFirstDayOfYear);
	let cachedSources = null;
	let cachedYear = null;
	let cachedMetadataKey = null;
	const dailyMetadata = new Map();
	const weeklyMetadata = new Map();

	function getCachedDailyMetadata(date) {
		const key = date.clone().startOf("day").format("YYYY-MM-DD");
		let metadata = dailyMetadata.get(key);

		if (!metadata) {
			metadata = getDailyMetadata(sources, date);
			dailyMetadata.set(key, metadata);
		}

		return metadata;
	}

	function getCachedWeeklyMetadata(date) {
		const key = getCalendarWeekStart(date, weekStart).format("YYYY-MM-DD");
		let metadata = weeklyMetadata.get(key);

		if (!metadata) {
			metadata = getWeeklyMetadata(sources, date);
			weeklyMetadata.set(key, metadata);
		}

		return metadata;
	}

	const click_handler = calendarMonth => onSelectMonth(calendarMonth.month);

	$$self.$$set = $$props => {
		if ('displayedMonth' in $$props) $$invalidate(0, displayedMonth = $$props.displayedMonth);
		if ('today' in $$props) $$invalidate(1, today = $$props.today);
		if ('locale' in $$props) $$invalidate(17, locale = $$props.locale);
		if ('weekStart' in $$props) $$invalidate(2, weekStart = $$props.weekStart);
		if ('localeFirstDayOfYear' in $$props) $$invalidate(18, localeFirstDayOfYear = $$props.localeFirstDayOfYear);
		if ('daysOfWeek' in $$props) $$invalidate(3, daysOfWeek = $$props.daysOfWeek);
		if ('sources' in $$props) $$invalidate(4, sources = $$props.sources);
		if ('selectedId' in $$props) $$invalidate(5, selectedId = $$props.selectedId);
		if ('showWeekNums' in $$props) $$invalidate(6, showWeekNums = $$props.showWeekNums);
		if ('metadataKey' in $$props) $$invalidate(19, metadataKey = $$props.metadataKey);
		if ('onHoverDay' in $$props) $$invalidate(7, onHoverDay = $$props.onHoverDay);
		if ('onHoverWeek' in $$props) $$invalidate(8, onHoverWeek = $$props.onHoverWeek);
		if ('onContextMenuDay' in $$props) $$invalidate(9, onContextMenuDay = $$props.onContextMenuDay);
		if ('onContextMenuWeek' in $$props) $$invalidate(10, onContextMenuWeek = $$props.onContextMenuWeek);
		if ('onClickDay' in $$props) $$invalidate(11, onClickDay = $$props.onClickDay);
		if ('onClickWeek' in $$props) $$invalidate(12, onClickWeek = $$props.onClickWeek);
		if ('onSelectMonth' in $$props) $$invalidate(13, onSelectMonth = $$props.onSelectMonth);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*displayedMonth, locale, weekStart, localeFirstDayOfYear*/ 393221) {
			$$invalidate(14, months = getCalendarYearMonths(displayedMonth, locale, weekStart, localeFirstDayOfYear));
		}

		if ($$self.$$.dirty & /*sources, cachedSources, displayedMonth, cachedYear, metadataKey, cachedMetadataKey*/ 7864337) {
			if (sources !== cachedSources || displayedMonth.year() !== cachedYear || metadataKey !== cachedMetadataKey) {
				$$invalidate(20, cachedSources = sources);
				$$invalidate(21, cachedYear = displayedMonth.year());
				$$invalidate(22, cachedMetadataKey = metadataKey);
				dailyMetadata.clear();
				weeklyMetadata.clear();
			}
		}
	};

	return [
		displayedMonth,
		today,
		weekStart,
		daysOfWeek,
		sources,
		selectedId,
		showWeekNums,
		onHoverDay,
		onHoverWeek,
		onContextMenuDay,
		onContextMenuWeek,
		onClickDay,
		onClickWeek,
		onSelectMonth,
		months,
		getCachedDailyMetadata,
		getCachedWeeklyMetadata,
		locale,
		localeFirstDayOfYear,
		metadataKey,
		cachedSources,
		cachedYear,
		cachedMetadataKey,
		click_handler
	];
}

class YearCalendar extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$2,
			create_fragment$2,
			not_equal,
			{
				displayedMonth: 0,
				today: 1,
				locale: 17,
				weekStart: 2,
				localeFirstDayOfYear: 18,
				daysOfWeek: 3,
				sources: 4,
				selectedId: 5,
				showWeekNums: 6,
				metadataKey: 19,
				onHoverDay: 7,
				onHoverWeek: 8,
				onContextMenuDay: 9,
				onContextMenuWeek: 10,
				onClickDay: 11,
				onClickWeek: 12,
				onSelectMonth: 13
			},
			add_css$2
		);
	}
}

/* src/ui/isolatedCalendar/Calendar.svelte generated by Svelte v3.59.2 */

function add_css$1(target) {
	append_styles(target, "svelte-o88gtj", ".container.svelte-o88gtj{--color-background-heading:transparent;--color-background-day:transparent;--color-background-weeknum:transparent;--color-background-weekend:transparent;--color-dot:var(--text-muted);--color-arrow:var(--text-muted);--color-button:var(--text-muted);--color-text-title:var(--text-normal);--color-text-heading:var(--text-muted);--color-text-day:var(--text-normal);--color-text-today:var(--interactive-accent);--color-text-weeknum:var(--text-muted)}.container.svelte-o88gtj{padding:0 8px}.container.is-mobile.svelte-o88gtj{padding:0}");
}

// (98:2) {:else}
function create_else_block(ctx) {
	let monthgrid;
	let current;

	monthgrid = new MonthGrid({
			props: {
				month: /*month*/ ctx[19],
				displayedMonth: /*localizedDisplayedMonth*/ ctx[18],
				today: /*localizedToday*/ ctx[17],
				daysOfWeek: /*daysOfWeek*/ ctx[20],
				sources: /*sources*/ ctx[9],
				selectedId: /*selectedId*/ ctx[10],
				weekStart: /*weekStartIndex*/ ctx[15],
				showWeekNums: /*showWeekNums*/ ctx[0],
				onHoverDay: /*onHoverDay*/ ctx[3],
				onHoverWeek: /*onHoverWeek*/ ctx[4],
				onContextMenuDay: /*onContextMenuDay*/ ctx[5],
				onContextMenuWeek: /*onContextMenuWeek*/ ctx[6],
				onClickDay: /*onClickDay*/ ctx[7],
				onClickWeek: /*onClickWeek*/ ctx[8]
			}
		});

	return {
		c() {
			create_component(monthgrid.$$.fragment);
		},
		m(target, anchor) {
			mount_component(monthgrid, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const monthgrid_changes = {};
			if (dirty & /*month*/ 524288) monthgrid_changes.month = /*month*/ ctx[19];
			if (dirty & /*localizedDisplayedMonth*/ 262144) monthgrid_changes.displayedMonth = /*localizedDisplayedMonth*/ ctx[18];
			if (dirty & /*localizedToday*/ 131072) monthgrid_changes.today = /*localizedToday*/ ctx[17];
			if (dirty & /*daysOfWeek*/ 1048576) monthgrid_changes.daysOfWeek = /*daysOfWeek*/ ctx[20];
			if (dirty & /*sources*/ 512) monthgrid_changes.sources = /*sources*/ ctx[9];
			if (dirty & /*selectedId*/ 1024) monthgrid_changes.selectedId = /*selectedId*/ ctx[10];
			if (dirty & /*weekStartIndex*/ 32768) monthgrid_changes.weekStart = /*weekStartIndex*/ ctx[15];
			if (dirty & /*showWeekNums*/ 1) monthgrid_changes.showWeekNums = /*showWeekNums*/ ctx[0];
			if (dirty & /*onHoverDay*/ 8) monthgrid_changes.onHoverDay = /*onHoverDay*/ ctx[3];
			if (dirty & /*onHoverWeek*/ 16) monthgrid_changes.onHoverWeek = /*onHoverWeek*/ ctx[4];
			if (dirty & /*onContextMenuDay*/ 32) monthgrid_changes.onContextMenuDay = /*onContextMenuDay*/ ctx[5];
			if (dirty & /*onContextMenuWeek*/ 64) monthgrid_changes.onContextMenuWeek = /*onContextMenuWeek*/ ctx[6];
			if (dirty & /*onClickDay*/ 128) monthgrid_changes.onClickDay = /*onClickDay*/ ctx[7];
			if (dirty & /*onClickWeek*/ 256) monthgrid_changes.onClickWeek = /*onClickWeek*/ ctx[8];
			monthgrid.$set(monthgrid_changes);
		},
		i(local) {
			if (current) return;
			transition_in(monthgrid.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(monthgrid.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(monthgrid, detaching);
		}
	};
}

// (78:2) {#if viewMode === "year"}
function create_if_block(ctx) {
	let yearcalendar;
	let current;

	yearcalendar = new YearCalendar({
			props: {
				displayedMonth: /*localizedDisplayedMonth*/ ctx[18],
				today: /*localizedToday*/ ctx[17],
				locale: /*locale*/ ctx[14],
				weekStart: /*weekStartIndex*/ ctx[15],
				localeFirstDayOfYear: /*localeFirstDayOfYear*/ ctx[16],
				daysOfWeek: /*daysOfWeek*/ ctx[20],
				sources: /*sources*/ ctx[9],
				selectedId: /*selectedId*/ ctx[10],
				showWeekNums: /*showWeekNums*/ ctx[0],
				metadataKey: /*metadataKey*/ ctx[1],
				onHoverDay: /*onHoverDay*/ ctx[3],
				onHoverWeek: /*onHoverWeek*/ ctx[4],
				onContextMenuDay: /*onContextMenuDay*/ ctx[5],
				onContextMenuWeek: /*onContextMenuWeek*/ ctx[6],
				onClickDay: /*onClickDay*/ ctx[7],
				onClickWeek: /*onClickWeek*/ ctx[8],
				onSelectMonth: /*selectMonth*/ ctx[23]
			}
		});

	return {
		c() {
			create_component(yearcalendar.$$.fragment);
		},
		m(target, anchor) {
			mount_component(yearcalendar, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const yearcalendar_changes = {};
			if (dirty & /*localizedDisplayedMonth*/ 262144) yearcalendar_changes.displayedMonth = /*localizedDisplayedMonth*/ ctx[18];
			if (dirty & /*localizedToday*/ 131072) yearcalendar_changes.today = /*localizedToday*/ ctx[17];
			if (dirty & /*locale*/ 16384) yearcalendar_changes.locale = /*locale*/ ctx[14];
			if (dirty & /*weekStartIndex*/ 32768) yearcalendar_changes.weekStart = /*weekStartIndex*/ ctx[15];
			if (dirty & /*localeFirstDayOfYear*/ 65536) yearcalendar_changes.localeFirstDayOfYear = /*localeFirstDayOfYear*/ ctx[16];
			if (dirty & /*daysOfWeek*/ 1048576) yearcalendar_changes.daysOfWeek = /*daysOfWeek*/ ctx[20];
			if (dirty & /*sources*/ 512) yearcalendar_changes.sources = /*sources*/ ctx[9];
			if (dirty & /*selectedId*/ 1024) yearcalendar_changes.selectedId = /*selectedId*/ ctx[10];
			if (dirty & /*showWeekNums*/ 1) yearcalendar_changes.showWeekNums = /*showWeekNums*/ ctx[0];
			if (dirty & /*metadataKey*/ 2) yearcalendar_changes.metadataKey = /*metadataKey*/ ctx[1];
			if (dirty & /*onHoverDay*/ 8) yearcalendar_changes.onHoverDay = /*onHoverDay*/ ctx[3];
			if (dirty & /*onHoverWeek*/ 16) yearcalendar_changes.onHoverWeek = /*onHoverWeek*/ ctx[4];
			if (dirty & /*onContextMenuDay*/ 32) yearcalendar_changes.onContextMenuDay = /*onContextMenuDay*/ ctx[5];
			if (dirty & /*onContextMenuWeek*/ 64) yearcalendar_changes.onContextMenuWeek = /*onContextMenuWeek*/ ctx[6];
			if (dirty & /*onClickDay*/ 128) yearcalendar_changes.onClickDay = /*onClickDay*/ ctx[7];
			if (dirty & /*onClickWeek*/ 256) yearcalendar_changes.onClickWeek = /*onClickWeek*/ ctx[8];
			yearcalendar.$set(yearcalendar_changes);
		},
		i(local) {
			if (current) return;
			transition_in(yearcalendar.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(yearcalendar.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(yearcalendar, detaching);
		}
	};
}

function create_fragment$1(ctx) {
	let div;
	let nav;
	let t;
	let current_block_type_index;
	let if_block;
	let current;

	nav = new Nav({
			props: {
				today: /*localizedToday*/ ctx[17],
				displayedMonth: /*localizedDisplayedMonth*/ ctx[18],
				locale: /*locale*/ ctx[14],
				viewMode: /*viewMode*/ ctx[2],
				incrementDisplayedMonth: /*incrementDisplayedMonth*/ ctx[11],
				decrementDisplayedMonth: /*decrementDisplayedMonth*/ ctx[12],
				resetDisplayedMonth: /*resetDisplayedMonth*/ ctx[13],
				onToggleView: /*toggleViewMode*/ ctx[22]
			}
		});

	const if_block_creators = [create_if_block, create_else_block];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*viewMode*/ ctx[2] === "year") return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c() {
			div = element("div");
			create_component(nav.$$.fragment);
			t = space();
			if_block.c();
			attr(div, "id", "calendar-container");
			attr(div, "class", "container svelte-o88gtj");
			toggle_class(div, "is-mobile", /*isMobile*/ ctx[21]);
		},
		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(nav, div, null);
			append(div, t);
			if_blocks[current_block_type_index].m(div, null);
			current = true;
		},
		p(ctx, [dirty]) {
			const nav_changes = {};
			if (dirty & /*localizedToday*/ 131072) nav_changes.today = /*localizedToday*/ ctx[17];
			if (dirty & /*localizedDisplayedMonth*/ 262144) nav_changes.displayedMonth = /*localizedDisplayedMonth*/ ctx[18];
			if (dirty & /*locale*/ 16384) nav_changes.locale = /*locale*/ ctx[14];
			if (dirty & /*viewMode*/ 4) nav_changes.viewMode = /*viewMode*/ ctx[2];
			nav.$set(nav_changes);
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(div, null);
			}
		},
		i(local) {
			if (current) return;
			transition_in(nav.$$.fragment, local);
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(nav.$$.fragment, local);
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_component(nav);
			if_blocks[current_block_type_index].d();
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { localeOverride = "system-default" } = $$props;
	let { weekStart = "locale" } = $$props;
	let { weekdayLabelFormat = "ddd" } = $$props;
	let { showWeekNums = false } = $$props;
	let { metadataKey = "" } = $$props;
	let { viewMode = "month" } = $$props;
	let { onViewModeChange = () => undefined } = $$props;
	let { onHoverDay } = $$props;
	let { onHoverWeek } = $$props;
	let { onContextMenuDay } = $$props;
	let { onContextMenuWeek } = $$props;
	let { onClickDay } = $$props;
	let { onClickWeek } = $$props;
	let { sources = [] } = $$props;
	let { selectedId } = $$props;
	let { today = window.moment() } = $$props;
	let { displayedMonth = today } = $$props;
	let locale;
	let weekStartIndex;
	let localeFirstDayOfYear;
	let localizedToday;
	let localizedDisplayedMonth;
	let month;
	let daysOfWeek;
	let isMobile = Boolean(window.app.isMobile);

	function incrementDisplayedMonth() {
		$$invalidate(24, displayedMonth = localizedDisplayedMonth.clone().add(1, viewMode === "year" ? "year" : "month"));
	}

	function decrementDisplayedMonth() {
		$$invalidate(24, displayedMonth = localizedDisplayedMonth.clone().subtract(1, viewMode === "year" ? "year" : "month"));
	}

	function resetDisplayedMonth() {
		$$invalidate(24, displayedMonth = localizedToday.clone());
	}

	function toggleViewMode() {
		onViewModeChange(viewMode === "month" ? "year" : "month");
	}

	function selectMonth(monthToDisplay) {
		$$invalidate(24, displayedMonth = monthToDisplay.clone());
		onViewModeChange("month");
	}

	$$self.$$set = $$props => {
		if ('localeOverride' in $$props) $$invalidate(25, localeOverride = $$props.localeOverride);
		if ('weekStart' in $$props) $$invalidate(26, weekStart = $$props.weekStart);
		if ('weekdayLabelFormat' in $$props) $$invalidate(27, weekdayLabelFormat = $$props.weekdayLabelFormat);
		if ('showWeekNums' in $$props) $$invalidate(0, showWeekNums = $$props.showWeekNums);
		if ('metadataKey' in $$props) $$invalidate(1, metadataKey = $$props.metadataKey);
		if ('viewMode' in $$props) $$invalidate(2, viewMode = $$props.viewMode);
		if ('onViewModeChange' in $$props) $$invalidate(28, onViewModeChange = $$props.onViewModeChange);
		if ('onHoverDay' in $$props) $$invalidate(3, onHoverDay = $$props.onHoverDay);
		if ('onHoverWeek' in $$props) $$invalidate(4, onHoverWeek = $$props.onHoverWeek);
		if ('onContextMenuDay' in $$props) $$invalidate(5, onContextMenuDay = $$props.onContextMenuDay);
		if ('onContextMenuWeek' in $$props) $$invalidate(6, onContextMenuWeek = $$props.onContextMenuWeek);
		if ('onClickDay' in $$props) $$invalidate(7, onClickDay = $$props.onClickDay);
		if ('onClickWeek' in $$props) $$invalidate(8, onClickWeek = $$props.onClickWeek);
		if ('sources' in $$props) $$invalidate(9, sources = $$props.sources);
		if ('selectedId' in $$props) $$invalidate(10, selectedId = $$props.selectedId);
		if ('today' in $$props) $$invalidate(29, today = $$props.today);
		if ('displayedMonth' in $$props) $$invalidate(24, displayedMonth = $$props.displayedMonth);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*localeOverride*/ 33554432) {
			$$invalidate(14, locale = resolveCalendarLocale(localeOverride));
		}

		if ($$self.$$.dirty & /*locale, weekStart*/ 67125248) {
			$$invalidate(15, weekStartIndex = getCalendarWeekStartIndex(locale, weekStart));
		}

		if ($$self.$$.dirty & /*locale*/ 16384) {
			$$invalidate(16, localeFirstDayOfYear = window.moment.localeData(locale).firstDayOfYear());
		}

		if ($$self.$$.dirty & /*today, locale*/ 536887296) {
			$$invalidate(17, localizedToday = withCalendarLocale(today, locale));
		}

		if ($$self.$$.dirty & /*displayedMonth, locale*/ 16793600) {
			$$invalidate(18, localizedDisplayedMonth = withCalendarLocale(displayedMonth, locale));
		}

		if ($$self.$$.dirty & /*localizedDisplayedMonth, locale, weekStartIndex, localeFirstDayOfYear*/ 376832) {
			$$invalidate(19, month = getCalendarMonth(localizedDisplayedMonth, locale, weekStartIndex, localeFirstDayOfYear));
		}

		if ($$self.$$.dirty & /*localizedToday, locale, weekStartIndex, weekdayLabelFormat*/ 134397952) {
			$$invalidate(20, daysOfWeek = getCalendarWeekdayLabels(localizedToday, locale, weekStartIndex, weekdayLabelFormat));
		}
	};

	return [
		showWeekNums,
		metadataKey,
		viewMode,
		onHoverDay,
		onHoverWeek,
		onContextMenuDay,
		onContextMenuWeek,
		onClickDay,
		onClickWeek,
		sources,
		selectedId,
		incrementDisplayedMonth,
		decrementDisplayedMonth,
		resetDisplayedMonth,
		locale,
		weekStartIndex,
		localeFirstDayOfYear,
		localizedToday,
		localizedDisplayedMonth,
		month,
		daysOfWeek,
		isMobile,
		toggleViewMode,
		selectMonth,
		displayedMonth,
		localeOverride,
		weekStart,
		weekdayLabelFormat,
		onViewModeChange,
		today
	];
}

let Calendar$1 = class Calendar extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$1,
			create_fragment$1,
			not_equal,
			{
				localeOverride: 25,
				weekStart: 26,
				weekdayLabelFormat: 27,
				showWeekNums: 0,
				metadataKey: 1,
				viewMode: 2,
				onViewModeChange: 28,
				onHoverDay: 3,
				onHoverWeek: 4,
				onContextMenuDay: 5,
				onContextMenuWeek: 6,
				onClickDay: 7,
				onClickWeek: 8,
				sources: 9,
				selectedId: 10,
				today: 29,
				displayedMonth: 24,
				incrementDisplayedMonth: 11,
				decrementDisplayedMonth: 12,
				resetDisplayedMonth: 13
			},
			add_css$1
		);
	}

	get incrementDisplayedMonth() {
		return this.$$.ctx[11];
	}

	get decrementDisplayedMonth() {
		return this.$$.ctx[12];
	}

	get resetDisplayedMonth() {
		return this.$$.ctx[13];
	}
};

/* src/ui/Calendar.svelte generated by Svelte v3.59.2 */

function add_css(target) {
	append_styles(target, "svelte-4o0xgm", ".existing-note-navigation.svelte-4o0xgm.svelte-4o0xgm{display:flex;gap:0.5em;justify-content:center;margin-top:0.5em}.existing-note-navigation.svelte-4o0xgm button.svelte-4o0xgm{color:var(--text-muted);font-size:0.7em;text-transform:uppercase}.erin-calendar-header-action{cursor:pointer;text-decoration:underline dotted;text-underline-offset:0.15em}.erin-calendar-header-action:focus-visible{border-radius:2px;outline:2px solid var(--interactive-accent);outline-offset:2px}.erin-calendar-quarter{color:var(--text-muted);font-size:0.7em;margin:0 0.35em}");
}

// (152:2) {#key calendarKey}
function create_key_block(ctx) {
	let isolatedcalendar;
	let updating_displayedMonth;
	let current;

	function isolatedcalendar_displayedMonth_binding(value) {
		/*isolatedcalendar_displayedMonth_binding*/ ctx[38](value);
	}

	let isolatedcalendar_props = {
		sources: /*sources*/ ctx[1],
		today: /*today*/ ctx[17],
		onHoverDay: /*onHoverDay*/ ctx[8],
		onHoverWeek: /*onHoverWeek*/ ctx[9],
		onContextMenuDay: /*onContextMenuDay*/ ctx[12],
		onContextMenuWeek: /*onContextMenuWeek*/ ctx[13],
		onClickDay: /*onClickDay*/ ctx[10],
		onClickWeek: /*onClickWeek*/ ctx[11],
		viewMode: /*displayMode*/ ctx[22],
		onViewModeChange: /*changeCalendarView*/ ctx[25],
		metadataKey: /*metadataKey*/ ctx[21],
		localeOverride: /*$settingsStore*/ ctx[16].localeOverride,
		weekStart: /*$settingsStore*/ ctx[16].weekStart,
		weekdayLabelFormat: /*$settingsStore*/ ctx[16].weekdayLabelFormat,
		selectedId: /*$activeFileStore*/ ctx[23],
		showWeekNums: /*$settingsStore*/ ctx[16].showWeeklyNote
	};

	if (/*displayedMonth*/ ctx[0] !== void 0) {
		isolatedcalendar_props.displayedMonth = /*displayedMonth*/ ctx[0];
	}

	isolatedcalendar = new Calendar$1({ props: isolatedcalendar_props });
	binding_callbacks.push(() => bind(isolatedcalendar, 'displayedMonth', isolatedcalendar_displayedMonth_binding));

	return {
		c() {
			create_component(isolatedcalendar.$$.fragment);
		},
		m(target, anchor) {
			mount_component(isolatedcalendar, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const isolatedcalendar_changes = {};
			if (dirty[0] & /*sources*/ 2) isolatedcalendar_changes.sources = /*sources*/ ctx[1];
			if (dirty[0] & /*today*/ 131072) isolatedcalendar_changes.today = /*today*/ ctx[17];
			if (dirty[0] & /*onHoverDay*/ 256) isolatedcalendar_changes.onHoverDay = /*onHoverDay*/ ctx[8];
			if (dirty[0] & /*onHoverWeek*/ 512) isolatedcalendar_changes.onHoverWeek = /*onHoverWeek*/ ctx[9];
			if (dirty[0] & /*onContextMenuDay*/ 4096) isolatedcalendar_changes.onContextMenuDay = /*onContextMenuDay*/ ctx[12];
			if (dirty[0] & /*onContextMenuWeek*/ 8192) isolatedcalendar_changes.onContextMenuWeek = /*onContextMenuWeek*/ ctx[13];
			if (dirty[0] & /*onClickDay*/ 1024) isolatedcalendar_changes.onClickDay = /*onClickDay*/ ctx[10];
			if (dirty[0] & /*onClickWeek*/ 2048) isolatedcalendar_changes.onClickWeek = /*onClickWeek*/ ctx[11];
			if (dirty[0] & /*displayMode*/ 4194304) isolatedcalendar_changes.viewMode = /*displayMode*/ ctx[22];
			if (dirty[0] & /*metadataKey*/ 2097152) isolatedcalendar_changes.metadataKey = /*metadataKey*/ ctx[21];
			if (dirty[0] & /*$settingsStore*/ 65536) isolatedcalendar_changes.localeOverride = /*$settingsStore*/ ctx[16].localeOverride;
			if (dirty[0] & /*$settingsStore*/ 65536) isolatedcalendar_changes.weekStart = /*$settingsStore*/ ctx[16].weekStart;
			if (dirty[0] & /*$settingsStore*/ 65536) isolatedcalendar_changes.weekdayLabelFormat = /*$settingsStore*/ ctx[16].weekdayLabelFormat;
			if (dirty[0] & /*$activeFileStore*/ 8388608) isolatedcalendar_changes.selectedId = /*$activeFileStore*/ ctx[23];
			if (dirty[0] & /*$settingsStore*/ 65536) isolatedcalendar_changes.showWeekNums = /*$settingsStore*/ ctx[16].showWeeklyNote;

			if (!updating_displayedMonth && dirty[0] & /*displayedMonth*/ 1) {
				updating_displayedMonth = true;
				isolatedcalendar_changes.displayedMonth = /*displayedMonth*/ ctx[0];
				add_flush_callback(() => updating_displayedMonth = false);
			}

			isolatedcalendar.$set(isolatedcalendar_changes);
		},
		i(local) {
			if (current) return;
			transition_in(isolatedcalendar.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(isolatedcalendar.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(isolatedcalendar, detaching);
		}
	};
}

function create_fragment(ctx) {
	let div1;
	let previous_key = /*calendarKey*/ ctx[15];
	let t0;
	let div0;
	let button0;
	let t1;
	let button0_disabled_value;
	let t2;
	let button1;
	let t3;
	let button1_disabled_value;
	let current;
	let mounted;
	let dispose;
	let key_block = create_key_block(ctx);

	return {
		c() {
			div1 = element("div");
			key_block.c();
			t0 = space();
			div0 = element("div");
			button0 = element("button");
			t1 = text("Prev");
			t2 = space();
			button1 = element("button");
			t3 = text("Next");
			attr(button0, "aria-label", "Open previous existing daily note");
			button0.disabled = button0_disabled_value = !/*previousDailyNote*/ ctx[19];
			attr(button0, "type", "button");
			attr(button0, "class", "svelte-4o0xgm");
			attr(button1, "aria-label", "Open next existing daily note");
			button1.disabled = button1_disabled_value = !/*nextDailyNote*/ ctx[20];
			attr(button1, "type", "button");
			attr(button1, "class", "svelte-4o0xgm");
			attr(div0, "class", "existing-note-navigation svelte-4o0xgm");
			attr(div0, "aria-label", "Daily note navigation");
		},
		m(target, anchor) {
			insert(target, div1, anchor);
			key_block.m(div1, null);
			append(div1, t0);
			append(div1, div0);
			append(div0, button0);
			append(button0, t1);
			append(div0, t2);
			append(div0, button1);
			append(button1, t3);
			/*div1_binding*/ ctx[41](div1);
			current = true;

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[39]),
					listen(button1, "click", /*click_handler_1*/ ctx[40]),
					listen(div1, "pointerleave", function () {
						if (is_function(/*onPointerLeave*/ ctx[14])) /*onPointerLeave*/ ctx[14].apply(this, arguments);
					})
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty[0] & /*calendarKey*/ 32768 && not_equal(previous_key, previous_key = /*calendarKey*/ ctx[15])) {
				group_outros();
				transition_out(key_block, 1, 1, noop);
				check_outros();
				key_block = create_key_block(ctx);
				key_block.c();
				transition_in(key_block, 1);
				key_block.m(div1, t0);
			} else {
				key_block.p(ctx, dirty);
			}

			if (!current || dirty[0] & /*previousDailyNote*/ 524288 && button0_disabled_value !== (button0_disabled_value = !/*previousDailyNote*/ ctx[19])) {
				button0.disabled = button0_disabled_value;
			}

			if (!current || dirty[0] & /*nextDailyNote*/ 1048576 && button1_disabled_value !== (button1_disabled_value = !/*nextDailyNote*/ ctx[20])) {
				button1.disabled = button1_disabled_value;
			}
		},
		i(local) {
			if (current) return;
			transition_in(key_block);
			current = true;
		},
		o(local) {
			transition_out(key_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div1);
			key_block.d(detaching);
			/*div1_binding*/ ctx[41](null);
			mounted = false;
			run_all(dispose);
		}
	};
}

function isNewTabEvent(event) {
	return event.metaKey || event.ctrlKey;
}

function setHeaderAction(element, enabled, label, onClick) {
	if (!element) {
		return;
	}

	element.classList.toggle("erin-calendar-header-action", enabled);

	if (!enabled) {
		element.removeAttribute("role");
		element.removeAttribute("tabindex");
		element.removeAttribute("aria-label");
		element.onclick = null;
		element.onkeydown = null;
		return;
	}

	element.setAttribute("role", "button");
	element.setAttribute("tabindex", "0");
	element.setAttribute("aria-label", label);

	element.onclick = event => {
		event.preventDefault();
		event.stopPropagation();
		onClick(event);
	};

	element.onkeydown = event => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		onClick(event);
	};
}

function instance($$self, $$props, $$invalidate) {
	let $settingsStore,
		$$unsubscribe_settingsStore = noop,
		$$subscribe_settingsStore = () => ($$unsubscribe_settingsStore(), $$unsubscribe_settingsStore = subscribe(settingsStore, $$value => $$invalidate(16, $settingsStore = $$value)), settingsStore);

	let $weeklyNotesStore,
		$$unsubscribe_weeklyNotesStore = noop,
		$$subscribe_weeklyNotesStore = () => ($$unsubscribe_weeklyNotesStore(), $$unsubscribe_weeklyNotesStore = subscribe(weeklyNotesStore, $$value => $$invalidate(34, $weeklyNotesStore = $$value)), weeklyNotesStore);

	let $dailyNotesStore,
		$$unsubscribe_dailyNotesStore = noop,
		$$subscribe_dailyNotesStore = () => ($$unsubscribe_dailyNotesStore(), $$unsubscribe_dailyNotesStore = subscribe(dailyNotesStore, $$value => $$invalidate(35, $dailyNotesStore = $$value)), dailyNotesStore);

	let $dateTagsStore,
		$$unsubscribe_dateTagsStore = noop,
		$$subscribe_dateTagsStore = () => ($$unsubscribe_dateTagsStore(), $$unsubscribe_dateTagsStore = subscribe(dateTagsStore, $$value => $$invalidate(36, $dateTagsStore = $$value)), dateTagsStore);

	let $activeDailyDateStore,
		$$unsubscribe_activeDailyDateStore = noop,
		$$subscribe_activeDailyDateStore = () => ($$unsubscribe_activeDailyDateStore(), $$unsubscribe_activeDailyDateStore = subscribe(activeDailyDateStore, $$value => $$invalidate(37, $activeDailyDateStore = $$value)), activeDailyDateStore);

	let $activeFileStore,
		$$unsubscribe_activeFileStore = noop,
		$$subscribe_activeFileStore = () => ($$unsubscribe_activeFileStore(), $$unsubscribe_activeFileStore = subscribe(activeFileStore, $$value => $$invalidate(23, $activeFileStore = $$value)), activeFileStore);

	$$self.$$.on_destroy.push(() => $$unsubscribe_settingsStore());
	$$self.$$.on_destroy.push(() => $$unsubscribe_weeklyNotesStore());
	$$self.$$.on_destroy.push(() => $$unsubscribe_dailyNotesStore());
	$$self.$$.on_destroy.push(() => $$unsubscribe_dateTagsStore());
	$$self.$$.on_destroy.push(() => $$unsubscribe_activeDailyDateStore());
	$$self.$$.on_destroy.push(() => $$unsubscribe_activeFileStore());
	let today = window.moment();
	let calendarEl;
	let { displayedMonth = today } = $$props;
	let { sources } = $$props;
	let { settingsStore = settings } = $$props;
	$$subscribe_settingsStore();
	let { dailyNotesStore = dailyNotes } = $$props;
	$$subscribe_dailyNotesStore();
	let { weeklyNotesStore = weeklyNotes } = $$props;
	$$subscribe_weeklyNotesStore();
	let { dateTagsStore = dateTags } = $$props;
	$$subscribe_dateTagsStore();
	let { activeDailyDateStore = activeDailyDate } = $$props;
	$$subscribe_activeDailyDateStore();
	let { activeFileStore = activeFile } = $$props;
	$$subscribe_activeFileStore();
	let { onHoverDay } = $$props;
	let { onHoverWeek } = $$props;
	let { onClickDay } = $$props;
	let { onClickWeek } = $$props;
	let { onContextMenuDay } = $$props;
	let { onContextMenuWeek } = $$props;
	let { onNavigateDailyNote = () => undefined } = $$props;
	let { onClickMonth = () => false } = $$props;
	let { onClickQuarter = () => false } = $$props;
	let { onClickYear = () => false } = $$props;
	let { onCalendarViewChange = () => undefined } = $$props;
	let { onPointerLeave = () => undefined } = $$props;
	let selectedDailyDate;
	let previousDailyNote;
	let nextDailyNote;
	let calendarKey;
	let metadataKey;
	let displayMode = "month";
	let appliedCalendarView = null;
	const indexKeys = new WeakMap();
	let nextIndexKey = 0;

	function getIndexKey(index) {
		if (!index) {
			return 0;
		}

		let key = indexKeys.get(index);

		if (key === undefined) {
			key = ++nextIndexKey;
			indexKeys.set(index, key);
		}

		return key;
	}

	function tick(calendarSettings = $settingsStore) {
		$$invalidate(17, today = window.moment().locale(resolveCalendarLocale(calendarSettings.localeOverride)));
	}

	function navigateToDailyNote(note) {
		if (note) {
			onNavigateDailyNote(note.date);
		}
	}

	function changeCalendarView(viewMode) {
		$$invalidate(22, displayMode = viewMode);
		onCalendarViewChange(viewMode);
	}

	function updatePeriodicHeaderActions() {
		const title = calendarEl === null || calendarEl === void 0
		? void 0
		: calendarEl.querySelector("#calendar-container .nav .title");

		const month = (title === null || title === void 0
		? void 0
		: title.querySelector(".month")) || null;

		const year = (title === null || title === void 0
		? void 0
		: title.querySelector(".year")) || null;

		let quarter = (title === null || title === void 0
		? void 0
		: title.querySelector(".erin-calendar-quarter")) || null;

		if (displayMode === "month" && $settingsStore.showQuarterlyNote && title && year) {
			if (!quarter) {
				quarter = title.ownerDocument.createElement("span");
				quarter.className = "erin-calendar-quarter";
				year.before(quarter);
			}

			quarter.textContent = displayedMonth.format("[Q]Q");
		} else {
			quarter === null || quarter === void 0
			? void 0
			: quarter.remove();

			quarter = null;
		}

		setHeaderAction(month, displayMode === "month" && $settingsStore.showMonthlyNote, "Open monthly note", event => onClickMonth(displayedMonth.clone(), isNewTabEvent(event)));
		setHeaderAction(quarter, displayMode === "month" && $settingsStore.showQuarterlyNote, "Open quarterly note", event => onClickQuarter(displayedMonth.clone(), isNewTabEvent(event)));
		setHeaderAction(year, $settingsStore.showYearlyNote, "Open yearly note", event => onClickYear(displayedMonth.clone(), isNewTabEvent(event)));
	}

	afterUpdate(() => {
		updatePeriodicHeaderActions();
	});

	// 1 minute heartbeat to keep `today` reflecting the current day
	let heartbeat = setInterval(
		() => {
			tick();
			const isViewingCurrentMonth = displayedMonth.isSame(today, "day");

			if (isViewingCurrentMonth) {
				// if it's midnight on the last day of the month, this will
				// update the display to show the new month.
				$$invalidate(0, displayedMonth = today);
			}
		},
		1000 * 60
	);

	onDestroy(() => {
		clearInterval(heartbeat);
	});

	function isolatedcalendar_displayedMonth_binding(value) {
		displayedMonth = value;
		$$invalidate(0, displayedMonth);
	}

	const click_handler = () => navigateToDailyNote(previousDailyNote);
	const click_handler_1 = () => navigateToDailyNote(nextDailyNote);

	function div1_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			calendarEl = $$value;
			$$invalidate(18, calendarEl);
		});
	}

	$$self.$$set = $$props => {
		if ('displayedMonth' in $$props) $$invalidate(0, displayedMonth = $$props.displayedMonth);
		if ('sources' in $$props) $$invalidate(1, sources = $$props.sources);
		if ('settingsStore' in $$props) $$subscribe_settingsStore($$invalidate(2, settingsStore = $$props.settingsStore));
		if ('dailyNotesStore' in $$props) $$subscribe_dailyNotesStore($$invalidate(3, dailyNotesStore = $$props.dailyNotesStore));
		if ('weeklyNotesStore' in $$props) $$subscribe_weeklyNotesStore($$invalidate(4, weeklyNotesStore = $$props.weeklyNotesStore));
		if ('dateTagsStore' in $$props) $$subscribe_dateTagsStore($$invalidate(5, dateTagsStore = $$props.dateTagsStore));
		if ('activeDailyDateStore' in $$props) $$subscribe_activeDailyDateStore($$invalidate(6, activeDailyDateStore = $$props.activeDailyDateStore));
		if ('activeFileStore' in $$props) $$subscribe_activeFileStore($$invalidate(7, activeFileStore = $$props.activeFileStore));
		if ('onHoverDay' in $$props) $$invalidate(8, onHoverDay = $$props.onHoverDay);
		if ('onHoverWeek' in $$props) $$invalidate(9, onHoverWeek = $$props.onHoverWeek);
		if ('onClickDay' in $$props) $$invalidate(10, onClickDay = $$props.onClickDay);
		if ('onClickWeek' in $$props) $$invalidate(11, onClickWeek = $$props.onClickWeek);
		if ('onContextMenuDay' in $$props) $$invalidate(12, onContextMenuDay = $$props.onContextMenuDay);
		if ('onContextMenuWeek' in $$props) $$invalidate(13, onContextMenuWeek = $$props.onContextMenuWeek);
		if ('onNavigateDailyNote' in $$props) $$invalidate(26, onNavigateDailyNote = $$props.onNavigateDailyNote);
		if ('onClickMonth' in $$props) $$invalidate(27, onClickMonth = $$props.onClickMonth);
		if ('onClickQuarter' in $$props) $$invalidate(28, onClickQuarter = $$props.onClickQuarter);
		if ('onClickYear' in $$props) $$invalidate(29, onClickYear = $$props.onClickYear);
		if ('onCalendarViewChange' in $$props) $$invalidate(30, onCalendarViewChange = $$props.onCalendarViewChange);
		if ('onPointerLeave' in $$props) $$invalidate(14, onPointerLeave = $$props.onPointerLeave);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*$settingsStore*/ 65536) {
			tick($settingsStore);
		}

		if ($$self.$$.dirty[0] & /*$settingsStore*/ 65536 | $$self.$$.dirty[1] & /*appliedCalendarView*/ 4) {
			if ($settingsStore.calendarView !== appliedCalendarView) {
				$$invalidate(22, displayMode = $settingsStore.calendarView);
				$$invalidate(33, appliedCalendarView = $settingsStore.calendarView);
			}
		}

		if ($$self.$$.dirty[1] & /*$activeDailyDateStore*/ 64) {
			$$invalidate(32, selectedDailyDate = $activeDailyDateStore);
		}

		if ($$self.$$.dirty[1] & /*selectedDailyDate, $dailyNotesStore*/ 18) {
			$$invalidate(19, previousDailyNote = selectedDailyDate
			? getAdjacentDailyNote(selectedDailyDate, $dailyNotesStore, "previous")
			: null);
		}

		if ($$self.$$.dirty[1] & /*selectedDailyDate, $dailyNotesStore*/ 18) {
			$$invalidate(20, nextDailyNote = selectedDailyDate
			? getAdjacentDailyNote(selectedDailyDate, $dailyNotesStore, "next")
			: null);
		}

		if ($$self.$$.dirty[0] & /*$settingsStore*/ 65536 | $$self.$$.dirty[1] & /*$dateTagsStore, $dailyNotesStore, $weeklyNotesStore*/ 56) {
			$$invalidate(15, calendarKey = `${$settingsStore.localeOverride}:${$settingsStore.weekStart}:${$dateTagsStore.version}:${getIndexKey($dailyNotesStore)}:${getIndexKey($weeklyNotesStore)}`);
		}

		if ($$self.$$.dirty[0] & /*calendarKey, $settingsStore*/ 98304) {
			$$invalidate(21, metadataKey = `${calendarKey}:${$settingsStore.wordsPerDot}`);
		}
	};

	return [
		displayedMonth,
		sources,
		settingsStore,
		dailyNotesStore,
		weeklyNotesStore,
		dateTagsStore,
		activeDailyDateStore,
		activeFileStore,
		onHoverDay,
		onHoverWeek,
		onClickDay,
		onClickWeek,
		onContextMenuDay,
		onContextMenuWeek,
		onPointerLeave,
		calendarKey,
		$settingsStore,
		today,
		calendarEl,
		previousDailyNote,
		nextDailyNote,
		metadataKey,
		displayMode,
		$activeFileStore,
		navigateToDailyNote,
		changeCalendarView,
		onNavigateDailyNote,
		onClickMonth,
		onClickQuarter,
		onClickYear,
		onCalendarViewChange,
		tick,
		selectedDailyDate,
		appliedCalendarView,
		$weeklyNotesStore,
		$dailyNotesStore,
		$dateTagsStore,
		$activeDailyDateStore,
		isolatedcalendar_displayedMonth_binding,
		click_handler,
		click_handler_1,
		div1_binding
	];
}

class Calendar extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance,
			create_fragment,
			not_equal,
			{
				displayedMonth: 0,
				sources: 1,
				settingsStore: 2,
				dailyNotesStore: 3,
				weeklyNotesStore: 4,
				dateTagsStore: 5,
				activeDailyDateStore: 6,
				activeFileStore: 7,
				onHoverDay: 8,
				onHoverWeek: 9,
				onClickDay: 10,
				onClickWeek: 11,
				onContextMenuDay: 12,
				onContextMenuWeek: 13,
				onNavigateDailyNote: 26,
				onClickMonth: 27,
				onClickQuarter: 28,
				onClickYear: 29,
				onCalendarViewChange: 30,
				onPointerLeave: 14,
				tick: 31
			},
			add_css,
			[-1, -1]
		);
	}

	get tick() {
		return this.$$.ctx[31];
	}
}

function showFileMenu(app, file, position) {
    const fileMenu = new obsidian.Menu();
    fileMenu.addItem((item) => item
        .setTitle("Delete")
        .setIcon("trash")
        .onClick(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.fileManager.promptForFileDeletion(file);
    }));
    app.workspace.trigger("file-menu", fileMenu, file, "calendar-context-menu", null);
    fileMenu.showAtPosition(position);
}

/** Surface exact #YYYY-MM-DD tags as a calendar dot and native hover title. */
function createDateTagsSource(dateTagsStore) {
    const dateTagTitle = (date) => getDateTagEntries(date, get_store_value(dateTagsStore))
        .map((entry) => `${entry.description} (${entry.file.path})`)
        .join("\n");
    return {
        getDailyMetadata: async (date) => {
            const title = dateTagTitle(date);
            return title
                ? {
                    classes: ["has-date-tag"],
                    dataAttributes: { title },
                    dots: [
                        {
                            className: "date-tag",
                            color: "default",
                            isFilled: false,
                        },
                    ],
                }
                : { dots: [] };
        },
        getWeeklyMetadata: async () => ({ dots: [] }),
    };
}
const dateTagsSource = createDateTagsSource(dateTags);

const getStreakClasses = (files) => {
    return classList({
        "has-note": files.length > 0,
    });
};
function createStreakSource(dailyNotesStore, weeklyNotesStore, settingsStore) {
    return {
        getDailyMetadata: async (date) => {
            const files = getDailyNotesForDate(date, get_store_value(dailyNotesStore));
            return {
                classes: getStreakClasses(files),
                dots: [],
            };
        },
        getWeeklyMetadata: async (date) => {
            const file = getWeeklyNoteForDate(date, get_store_value(weeklyNotesStore), get_store_value(settingsStore));
            return {
                classes: getStreakClasses(file ? [file] : []),
                dots: [],
            };
        },
    };
}
const streakSource = createStreakSource(dailyNotes, weeklyNotes, settings);

function getNoteTags(note) {
    var _a;
    if (!note) {
        return [];
    }
    const { metadataCache } = window.app;
    const frontmatter = (_a = metadataCache.getFileCache(note)) === null || _a === void 0 ? void 0 : _a.frontmatter;
    const tags = [];
    if (frontmatter) {
        const frontmatterTags = obsidian.parseFrontMatterTags(frontmatter) || [];
        tags.push(...frontmatterTags);
    }
    // strip the '#' at the beginning
    return tags.map((tag) => tag.substring(1));
}
function getFormattedTagAttributes(notes) {
    const attrs = {};
    const tags = Array.from(new Set(notes.reduce((allTags, note) => allTags.concat(getNoteTags(note)), [])));
    const [emojiTags, nonEmojiTags] = partition(tags, (tag) => /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/.test(tag));
    if (nonEmojiTags) {
        attrs["data-tags"] = nonEmojiTags.join(" ");
    }
    if (emojiTags) {
        attrs["data-emoji-tag"] = emojiTags[0];
    }
    return attrs;
}
function createCustomTagsSource(dailyNotesStore, weeklyNotesStore, settingsStore) {
    return {
        getDailyMetadata: async (date) => {
            const files = getDailyNotesForDate(date, get_store_value(dailyNotesStore));
            return {
                dataAttributes: getFormattedTagAttributes(files),
                dots: [],
            };
        },
        getWeeklyMetadata: async (date) => {
            const file = getWeeklyNoteForDate(date, get_store_value(weeklyNotesStore), get_store_value(settingsStore));
            return {
                dataAttributes: getFormattedTagAttributes(file ? [file] : []),
                dots: [],
            };
        },
    };
}
const customTagsSource = createCustomTagsSource(dailyNotes, weeklyNotes, settings);

async function getNumberOfRemainingTasks(note) {
    if (!note) {
        return 0;
    }
    const { vault } = window.app;
    const fileContents = await vault.cachedRead(note);
    return (fileContents.match(/(-|\*) \[ \]/g) || []).length;
}
async function getDotsForDailyNote$1(dailyNote) {
    if (!dailyNote) {
        return [];
    }
    const numTasks = await getNumberOfRemainingTasks(dailyNote);
    const dots = [];
    if (numTasks) {
        dots.push({
            className: "task",
            color: "default",
            isFilled: false,
        });
    }
    return dots;
}
async function getDotsForNotes$1(notes) {
    const taskCounts = await Promise.all(notes.map(getNumberOfRemainingTasks));
    if (!taskCounts.some((count) => count > 0)) {
        return [];
    }
    return [
        {
            className: "task",
            color: "default",
            isFilled: false,
        },
    ];
}
function createTasksSource(dailyNotesStore, weeklyNotesStore, settingsStore) {
    return {
        getDailyMetadata: async (date) => {
            const dots = await getDotsForNotes$1(getDailyNotesForDate(date, get_store_value(dailyNotesStore)));
            return { dots };
        },
        getWeeklyMetadata: async (date) => {
            const file = getWeeklyNoteForDate(date, get_store_value(weeklyNotesStore), get_store_value(settingsStore));
            const dots = await getDotsForDailyNote$1(file);
            return { dots };
        },
    };
}
const tasksSource = createTasksSource(dailyNotes, weeklyNotes, settings);

const NUM_MAX_DOTS = 5;
async function getWordLengthAsDots(note, settingsStore = settings) {
    const { wordsPerDot = DEFAULT_WORDS_PER_DOT } = get_store_value(settingsStore);
    if (!note || wordsPerDot <= 0) {
        return 0;
    }
    const fileContents = await window.app.vault.cachedRead(note);
    const wordCount = getWordCount(fileContents);
    const numDots = wordCount / wordsPerDot;
    return clamp(Math.floor(numDots), 1, NUM_MAX_DOTS);
}
async function getDotsForDailyNote(dailyNote, settingsStore = settings) {
    if (!dailyNote) {
        return [];
    }
    const numSolidDots = await getWordLengthAsDots(dailyNote, settingsStore);
    const dots = [];
    for (let i = 0; i < numSolidDots; i++) {
        dots.push({
            color: "default",
            isFilled: true,
        });
    }
    return dots;
}
async function getDotsForNotes(notes, settingsStore = settings) {
    if (!notes.length) {
        return [];
    }
    const wordCounts = await Promise.all(notes.map((note) => getWordLengthAsDots(note, settingsStore)));
    const numSolidDots = clamp(wordCounts.reduce((total, count) => total + count, 0), 0, NUM_MAX_DOTS);
    return Array.from({ length: numSolidDots }, () => ({
        className: "",
        color: "default",
        isFilled: true,
    }));
}
function createWordCountSource(dailyNotesStore, weeklyNotesStore, settingsStore) {
    return {
        getDailyMetadata: async (date) => {
            const dots = await getDotsForNotes(getDailyNotesForDate(date, get_store_value(dailyNotesStore)), settingsStore);
            return { dots };
        },
        getWeeklyMetadata: async (date) => {
            const file = getWeeklyNoteForDate(date, get_store_value(weeklyNotesStore), get_store_value(settingsStore));
            const dots = await getDotsForDailyNote(file, settingsStore);
            return { dots };
        },
    };
}
const wordCountSource = createWordCountSource(dailyNotes, weeklyNotes, settings);

const periodicIntervalForHeader = {
    month: "monthly",
    quarter: "quarterly",
    year: "yearly",
};
function getConfiguredWeekStart(date, settings) {
    return withWeeklyMomentLocale(date, settings).startOf("week");
}
function getDailyIndexOptionsForSettings(settings) {
    return {
        locale: settings
            ? resolveCalendarLocale(settings.localeOverride)
            : undefined,
        metadataDateFormat: settings === null || settings === void 0 ? void 0 : settings.metadataDateFormat,
        metadataDateProperty: settings === null || settings === void 0 ? void 0 : settings.metadataDateProperty,
        useMetadataDates: settings === null || settings === void 0 ? void 0 : settings.useMetadataDates,
    };
}
class CalendarView extends obsidian.ItemView {
    constructor(leaf) {
        super(leaf);
        this.hoverPopover = null;
        this.openOrCreateDailyNote = this.openOrCreateDailyNote.bind(this);
        this.openOrCreateWeeklyNote = this.openOrCreateWeeklyNote.bind(this);
        this.openOrCreatePeriodicNote = this.openOrCreatePeriodicNote.bind(this);
        this.onNoteSettingsUpdate = this.onNoteSettingsUpdate.bind(this);
        this.onFileCreated = this.onFileCreated.bind(this);
        this.onFileDeleted = this.onFileDeleted.bind(this);
        this.onFileModified = this.onFileModified.bind(this);
        this.onFileRenamed = this.onFileRenamed.bind(this);
        this.onFileOpen = this.onFileOpen.bind(this);
        this.onMetadataChanged = this.onMetadataChanged.bind(this);
        this.onActiveLeafChange = this.onActiveLeafChange.bind(this);
        this.onHoverDay = this.onHoverDay.bind(this);
        this.onHoverWeek = this.onHoverWeek.bind(this);
        this.onPointerLeave = this.onPointerLeave.bind(this);
        this.onContextMenuDay = this.onContextMenuDay.bind(this);
        this.onContextMenuWeek = this.onContextMenuWeek.bind(this);
        this.registerEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.app.workspace.on("periodic-notes:settings-updated", this.onNoteSettingsUpdate));
        this.registerEvent(this.app.vault.on("create", this.onFileCreated));
        this.registerEvent(this.app.vault.on("delete", this.onFileDeleted));
        this.registerEvent(this.app.vault.on("modify", this.onFileModified));
        this.registerEvent(this.app.vault.on("rename", this.onFileRenamed));
        this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen));
        this.registerEvent(this.app.workspace.on("active-leaf-change", this.onActiveLeafChange));
        this.registerEvent(this.app.metadataCache.on("changed", this.onMetadataChanged));
        this.settings = null;
        this.register(settings.subscribe((value) => {
            const shouldRefreshDateTags = !this.settings ||
                this.settings.showDateTags !== value.showDateTags;
            this.settings = value;
            dailyNotes.reindex();
            weeklyNotes.reindex();
            if (shouldRefreshDateTags) {
                void dateTags.reindex(value.showDateTags);
            }
            if (this.calendar) {
                this.calendar.tick();
            }
        }));
    }
    getViewType() {
        return VIEW_TYPE_CALENDAR;
    }
    getDisplayText() {
        return "Calendar";
    }
    getIcon() {
        return "calendar-with-checkmark";
    }
    onClose() {
        this.dismissHoverPopover();
        if (this.calendar) {
            this.calendar.$destroy();
        }
        return Promise.resolve();
    }
    async onOpen() {
        const sources = [
            customTagsSource,
            streakSource,
            wordCountSource,
            tasksSource,
            dateTagsSource,
        ];
        this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);
        dailyNotes.reindex();
        weeklyNotes.reindex();
        void dateTags.reindex(this.settings.showDateTags);
        this.calendar = new Calendar({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            target: this.contentEl,
            props: {
                onClickDay: (date, inNewTab) => {
                    void this.openOrCreateDailyNote(date, inNewTab);
                    return true;
                },
                onClickWeek: (date, inNewTab) => {
                    void this.openOrCreateWeeklyNote(date, inNewTab);
                    return true;
                },
                onClickMonth: (date, inNewTab) => {
                    void this.openOrCreatePeriodicNote("month", date, inNewTab);
                    return true;
                },
                onClickQuarter: (date, inNewTab) => {
                    void this.openOrCreatePeriodicNote("quarter", date, inNewTab);
                    return true;
                },
                onClickYear: (date, inNewTab) => {
                    void this.openOrCreatePeriodicNote("year", date, inNewTab);
                    return true;
                },
                onHoverDay: this.onHoverDay,
                onHoverWeek: this.onHoverWeek,
                onContextMenuDay: this.onContextMenuDay,
                onContextMenuWeek: this.onContextMenuWeek,
                onPointerLeave: this.onPointerLeave,
                onNavigateDailyNote: (date) => {
                    void this.navigateToExistingDailyNote(date);
                },
                sources,
            },
        });
        this.updateActiveFile();
    }
    getDailyIndexOptions() {
        return getDailyIndexOptionsForSettings(this.settings);
    }
    dismissHoverPopover() {
        var _a;
        (_a = this.hoverPopover) === null || _a === void 0 ? void 0 : _a.unload();
        this.hoverPopover = null;
    }
    onPointerLeave() {
        this.dismissHoverPopover();
    }
    onActiveLeafChange(leaf) {
        if (leaf !== this.leaf) {
            this.dismissHoverPopover();
        }
    }
    onHoverDay(date, targetEl, isMetaPressed = false) {
        if (!isMetaPressed) {
            this.dismissHoverPopover();
            return false;
        }
        const note = getDailyNoteForDate(date, get_store_value(dailyNotes), this.getDailyIndexOptions());
        const dateTagEntry = getDateTagEntries(date, get_store_value(dateTags))[0];
        const targetFile = note || (dateTagEntry === null || dateTagEntry === void 0 ? void 0 : dateTagEntry.file);
        if (!targetFile) {
            return false;
        }
        const { format } = getDailyNoteSettings();
        this.app.workspace.trigger("link-hover", this, targetEl, note ? date.format(format) : targetFile.path, targetFile.path);
        return true;
    }
    onHoverWeek(date, targetEl, isMetaPressed = false) {
        if (!isMetaPressed) {
            this.dismissHoverPopover();
            return false;
        }
        const note = getWeeklyNoteForDate(date, get_store_value(weeklyNotes), this.settings);
        if (!note) {
            return false;
        }
        const { format } = resolveWeeklyNoteSettings(this.settings);
        this.app.workspace.trigger("link-hover", this, targetEl, formatWeeklyNoteDate(date, format, this.settings), note.path);
        return true;
    }
    onContextMenuDay(date, event) {
        const notes = getDailyNotesForDate(date, get_store_value(dailyNotes), this.getDailyIndexOptions());
        const taggedEntries = getDateTagEntries(date, get_store_value(dateTags));
        if (!notes.length && !taggedEntries.length) {
            return false;
        }
        if (notes.length === 1 && !taggedEntries.length) {
            showFileMenu(this.app, notes[0], { x: event.pageX, y: event.pageY });
            return true;
        }
        const menu = new obsidian.Menu();
        notes.forEach((note) => {
            menu.addItem((item) => item.setTitle(`Open daily note: ${note.path}`).onClick(() => {
                void this.openDailyFile(note, date, event.metaKey || event.ctrlKey);
            }));
        });
        if (notes.length && taggedEntries.length) {
            menu.addSeparator();
        }
        taggedEntries.forEach((entry) => {
            menu.addItem((item) => item
                .setTitle(`Open dated item: ${entry.description}`)
                .setIcon("calendar")
                .onClick(() => {
                void this.openNoteFile(entry.file, event.metaKey || event.ctrlKey, date);
            }));
        });
        menu.showAtMouseEvent(event);
        return true;
    }
    onContextMenuWeek(date, event) {
        const note = getWeeklyNoteForDate(date, get_store_value(weeklyNotes), this.settings);
        if (!note) {
            return false;
        }
        showFileMenu(this.app, note, { x: event.pageX, y: event.pageY });
        return true;
    }
    onNoteSettingsUpdate() {
        this.refreshCalendarData();
    }
    onFileDeleted(_file) {
        this.refreshCalendarData();
    }
    onFileModified(_file) {
        this.refreshCalendarData();
    }
    onFileCreated(_file) {
        this.refreshCalendarData();
    }
    onFileRenamed(_file) {
        this.refreshCalendarData();
    }
    onMetadataChanged(_file) {
        this.refreshCalendarData();
    }
    refreshCalendarData() {
        if (!this.app.workspace.layoutReady) {
            return;
        }
        dailyNotes.reindex();
        weeklyNotes.reindex();
        void dateTags.reindex(this.settings.showDateTags);
        this.updateActiveFile();
    }
    onFileOpen(_file) {
        if (this.app.workspace.layoutReady) {
            this.updateActiveFile();
        }
    }
    updateActiveFile() {
        const { view } = this.app.workspace.activeLeaf || {};
        let file = null;
        if (view instanceof obsidian.FileView) {
            file = view.file;
        }
        activeFile.setFile(file);
        if (this.calendar) {
            this.calendar.tick();
        }
    }
    revealActiveNote() {
        const { activeLeaf } = this.app.workspace;
        if ((activeLeaf === null || activeLeaf === void 0 ? void 0 : activeLeaf.view) instanceof obsidian.FileView) {
            let date = getDateFromCalendarDailyNote(activeLeaf.view.file, this.getDailyIndexOptions());
            if (date) {
                this.calendar.$set({ displayedMonth: date });
                return;
            }
            date = getDateFromWeeklyNoteFile(activeLeaf.view.file, this.settings);
            if (date) {
                this.calendar.$set({ displayedMonth: date });
            }
        }
    }
    async openNoteFile(file, inNewTab, selectedDailyDate, actionContext) {
        var _a;
        const { workspace } = this.app;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mode = this.app.vault.getConfig("defaultViewMode");
        const leaf = getNoteLeaf(inNewTab);
        await leaf.openFile(file, { active: true, state: { mode } });
        activeFile.setFile(file, selectedDailyDate);
        (_a = actionContext === null || actionContext === void 0 ? void 0 : actionContext.onFileOpened) === null || _a === void 0 ? void 0 : _a.call(actionContext, file, selectedDailyDate);
        workspace.setActiveLeaf(leaf, { focus: true });
    }
    async openDailyFile(file, date, inNewTab, actionContext) {
        await this.openNoteFile(file, inNewTab, date, actionContext);
    }
    async openOrCreateWeeklyNote(date, inNewTab, actionContext) {
        const actionSettings = (actionContext === null || actionContext === void 0 ? void 0 : actionContext.settings) || this.settings;
        const startOfWeek = getConfiguredWeekStart(date, actionSettings);
        const existingFile = getWeeklyNoteForDate(startOfWeek, (actionContext === null || actionContext === void 0 ? void 0 : actionContext.weeklyNotesIndex) || get_store_value(weeklyNotes), actionSettings);
        if (!existingFile) {
            await tryToCreateWeeklyNote(startOfWeek, inNewTab, actionSettings, (file) => {
                var _a;
                activeFile.setFile(file);
                (_a = actionContext === null || actionContext === void 0 ? void 0 : actionContext.onFileOpened) === null || _a === void 0 ? void 0 : _a.call(actionContext, file);
            });
            return;
        }
        await this.openNoteFile(existingFile, inNewTab, undefined, actionContext);
    }
    async openOrCreateDailyNote(date, inNewTab, actionContext) {
        const actionSettings = (actionContext === null || actionContext === void 0 ? void 0 : actionContext.settings) || this.settings;
        const existingFiles = getDailyNotesForDate(date, (actionContext === null || actionContext === void 0 ? void 0 : actionContext.dailyNotesIndex) || get_store_value(dailyNotes), getDailyIndexOptionsForSettings(actionSettings));
        if (!existingFiles.length) {
            await tryToCreateDailyNote(date, inNewTab, actionSettings, (dailyNote) => {
                var _a;
                activeFile.setFile(dailyNote, date);
                (_a = actionContext === null || actionContext === void 0 ? void 0 : actionContext.onFileOpened) === null || _a === void 0 ? void 0 : _a.call(actionContext, dailyNote, date);
            });
            return;
        }
        if (existingFiles.length > 1) {
            showFilePicker({
                files: existingFiles,
                onChoose: (file) => this.openDailyFile(file, date, inNewTab, actionContext),
                text: "More than one note is associated with this date.",
                title: `Choose a note for ${date.format("LL")}`,
            });
            return;
        }
        await this.openDailyFile(existingFiles[0], date, inNewTab, actionContext);
    }
    async openOrCreatePeriodicNote(granularity, date, inNewTab, actionContext) {
        const actionSettings = (actionContext === null || actionContext === void 0 ? void 0 : actionContext.settings) || this.settings;
        const interval = periodicIntervalForHeader[granularity];
        if (!appHasPeriodicNotesPluginLoaded(interval)) {
            new obsidian.Notice(`Enable ${interval.replace(/^./, (letter) => letter.toUpperCase())} Notes in Periodic Notes first.`);
            return;
        }
        const existingFile = getExistingPeriodicNote(granularity, date);
        if (existingFile) {
            await this.openNoteFile(existingFile, inNewTab, undefined, actionContext);
            return;
        }
        await tryToCreatePeriodicNote(granularity, date, inNewTab, actionSettings, (file) => {
            var _a;
            activeFile.setFile(file);
            (_a = actionContext === null || actionContext === void 0 ? void 0 : actionContext.onFileOpened) === null || _a === void 0 ? void 0 : _a.call(actionContext, file);
        });
    }
    async navigateToExistingDailyNote(date) {
        var _a;
        await this.openOrCreateDailyNote(date, false);
        (_a = this.calendar) === null || _a === void 0 ? void 0 : _a.$set({ displayedMonth: date });
    }
}

const BOOLEAN_SETTING_KEYS = [
    "shouldConfirmBeforeCreate",
    "showMonthlyNote",
    "showQuarterlyNote",
    "showYearlyNote",
    "showWeeklyNote",
    "showDateTags",
    "useMetadataDates",
];
const STRING_SETTING_KEYS = [
    "weekdayLabelFormat",
    "weeklyNoteFormat",
    "weeklyNoteTemplate",
    "weeklyNoteFolder",
    "metadataDateProperty",
    "metadataDateFormat",
    "localeOverride",
];
const WEEK_START_OPTIONS = new Set([
    "locale",
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
]);
const CALENDAR_VIEW_OPTIONS = new Set(["month", "year"]);
const SETTING_KEYS = new Set([
    "calendarView",
    "wordsPerDot",
    "weekdayLabelFormat",
    "weekStart",
    "shouldConfirmBeforeCreate",
    "showMonthlyNote",
    "showQuarterlyNote",
    "showYearlyNote",
    "showWeeklyNote",
    "weeklyNoteFormat",
    "weeklyNoteTemplate",
    "weeklyNoteFolder",
    "showDateTags",
    "useMetadataDates",
    "metadataDateProperty",
    "metadataDateFormat",
    "localeOverride",
]);
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isBooleanSettingKey(key) {
    return BOOLEAN_SETTING_KEYS.includes(key);
}
function isStringSettingKey(key) {
    return STRING_SETTING_KEYS.includes(key);
}
/**
 * Parses the contents of an `erin-calendar` fenced block as YAML.
 *
 * Only known, correctly-typed settings are returned. Invalid settings never
 * prevent the calendar from rendering; they are omitted and explained in
 * `diagnostics` instead.
 */
function parseEmbedSettings(source) {
    if (source.trim() === "") {
        return { overrides: {}, diagnostics: [] };
    }
    let parsed;
    try {
        parsed = obsidian.parseYaml(source);
    }
    catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        return {
            overrides: {},
            diagnostics: [`Could not parse Erin Calendar embed settings${detail}`],
        };
    }
    // Obsidian's YAML parser returns null for a block containing only comments.
    if (parsed === null || parsed === undefined) {
        return { overrides: {}, diagnostics: [] };
    }
    if (!isRecord(parsed)) {
        return {
            overrides: {},
            diagnostics: ["Erin Calendar embed settings must be a YAML mapping."],
        };
    }
    const overrides = {};
    const diagnostics = [];
    const target = overrides;
    for (const [key, value] of Object.entries(parsed)) {
        if (!SETTING_KEYS.has(key)) {
            diagnostics.push(`Unknown Erin Calendar embed setting: ${key}.`);
            continue;
        }
        if (key === "wordsPerDot") {
            if (typeof value === "number" && Number.isFinite(value)) {
                target[key] = value;
            }
            else {
                diagnostics.push("Embed setting wordsPerDot must be a finite number.");
            }
            continue;
        }
        if (key === "calendarView") {
            if (typeof value === "string" &&
                CALENDAR_VIEW_OPTIONS.has(value)) {
                target[key] = value;
            }
            else {
                diagnostics.push("Embed setting calendarView must be month or year.");
            }
            continue;
        }
        if (key === "weekStart") {
            if (typeof value === "string" && WEEK_START_OPTIONS.has(value)) {
                target[key] = value;
            }
            else {
                diagnostics.push("Embed setting weekStart must be locale, sunday, monday, tuesday, wednesday, thursday, friday, or saturday.");
            }
            continue;
        }
        if (isBooleanSettingKey(key)) {
            if (typeof value === "boolean") {
                target[key] = value;
            }
            else {
                diagnostics.push(`Embed setting ${key} must be true or false.`);
            }
            continue;
        }
        if (isStringSettingKey(key)) {
            if (typeof value === "string") {
                target[key] = value;
            }
            else {
                diagnostics.push(`Embed setting ${key} must be a string.`);
            }
        }
    }
    return { overrides, diagnostics };
}
/** Returns a per-embed settings object without mutating the global settings. */
function mergeEmbedSettings(globalSettings, overrides) {
    return Object.assign(Object.assign({}, globalSettings), overrides);
}

/** Renders `erin-calendar` blocks with settings local to each fenced block. */
class CalendarEmbed extends obsidian.MarkdownRenderChild {
    constructor(containerEl, plugin, source) {
        super(containerEl);
        this.plugin = plugin;
        this.calendar = null;
        this.settingsUnsubscribe = null;
        this.effectiveSettings = writable(defaultSettings);
        this.dailyNotes = createDailyNotesStore(this.effectiveSettings);
        this.weeklyNotes = createWeeklyNotesStore(this.effectiveSettings);
        this.dateTags = createDateTagsStore();
        this.selection = createCalendarSelection(this.effectiveSettings);
        this.sources = [
            createCustomTagsSource(this.dailyNotes, this.weeklyNotes, this.effectiveSettings),
            createStreakSource(this.dailyNotes, this.weeklyNotes, this.effectiveSettings),
            createWordCountSource(this.dailyNotes, this.weeklyNotes, this.effectiveSettings),
            createTasksSource(this.dailyNotes, this.weeklyNotes, this.effectiveSettings),
            createDateTagsSource(this.dateTags),
        ];
        this.onCalendarDataChanged = () => {
            this.refreshCalendarData();
        };
        const parsedSettings = parseEmbedSettings(source);
        this.overrides = parsedSettings.overrides;
        this.diagnostics = parsedSettings.diagnostics;
    }
    onload() {
        this.containerEl.addClass("erin-calendar-embed");
        this.renderDiagnostics();
        this.settingsUnsubscribe = settings.subscribe((globalSettings) => {
            this.effectiveSettings.set(mergeEmbedSettings(globalSettings, this.overrides));
            this.refreshCalendarData();
        });
        this.registerEvent(this.plugin.app.vault.on("create", this.onCalendarDataChanged));
        this.registerEvent(this.plugin.app.vault.on("delete", this.onCalendarDataChanged));
        this.registerEvent(this.plugin.app.vault.on("modify", this.onCalendarDataChanged));
        this.registerEvent(this.plugin.app.vault.on("rename", this.onCalendarDataChanged));
        this.registerEvent(this.plugin.app.metadataCache.on("changed", this.onCalendarDataChanged));
        this.registerEvent(this.plugin.app.workspace.on("file-open", this.onCalendarDataChanged));
        this.registerEvent(
        // Periodic Notes changes can alter the inherited weekly note path.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.plugin.app.workspace.on("periodic-notes:settings-updated", this.onCalendarDataChanged));
        this.calendar = new Calendar({
            target: this.containerEl,
            props: {
                onClickDay: (date, inNewSplit) => {
                    void this.plugin
                        .getOrCreateCalendarView()
                        .then((view) => view.openOrCreateDailyNote(date, inNewSplit, this.getActionContext()));
                    return true;
                },
                onClickWeek: (date, inNewSplit) => {
                    void this.plugin
                        .getOrCreateCalendarView()
                        .then((view) => view.openOrCreateWeeklyNote(date, inNewSplit, this.getActionContext()));
                    return true;
                },
                onClickMonth: (date, inNewSplit) => {
                    void this.plugin
                        .getOrCreateCalendarView()
                        .then((view) => view.openOrCreatePeriodicNote("month", date, inNewSplit, this.getActionContext()));
                    return true;
                },
                onClickQuarter: (date, inNewSplit) => {
                    void this.plugin
                        .getOrCreateCalendarView()
                        .then((view) => view.openOrCreatePeriodicNote("quarter", date, inNewSplit, this.getActionContext()));
                    return true;
                },
                onClickYear: (date, inNewSplit) => {
                    void this.plugin
                        .getOrCreateCalendarView()
                        .then((view) => view.openOrCreatePeriodicNote("year", date, inNewSplit, this.getActionContext()));
                    return true;
                },
                onHoverDay: () => true,
                onHoverWeek: () => true,
                onContextMenuDay: () => true,
                onContextMenuWeek: () => true,
                onNavigateDailyNote: (date) => {
                    void this.plugin
                        .getOrCreateCalendarView()
                        .then((view) => view.openOrCreateDailyNote(date, false, this.getActionContext()));
                },
                sources: this.sources,
                settingsStore: this.effectiveSettings,
                dailyNotesStore: this.dailyNotes,
                weeklyNotesStore: this.weeklyNotes,
                dateTagsStore: this.dateTags,
                activeDailyDateStore: this.selection.activeDailyDate,
                activeFileStore: this.selection.activeFile,
            },
        });
        this.updateActiveFile();
    }
    onunload() {
        var _a, _b;
        (_a = this.settingsUnsubscribe) === null || _a === void 0 ? void 0 : _a.call(this);
        this.settingsUnsubscribe = null;
        (_b = this.calendar) === null || _b === void 0 ? void 0 : _b.$destroy();
        this.calendar = null;
    }
    refreshCalendarData() {
        var _a;
        const currentSettings = get_store_value(this.effectiveSettings);
        this.dailyNotes.reindex();
        this.weeklyNotes.reindex();
        void this.dateTags.reindex(currentSettings.showDateTags);
        this.updateActiveFile();
        (_a = this.calendar) === null || _a === void 0 ? void 0 : _a.tick();
    }
    updateActiveFile() {
        const { view } = this.plugin.app.workspace.activeLeaf || {};
        const file = view instanceof obsidian.FileView ? view.file : null;
        this.selection.activeFile.setFile(file);
    }
    getActionContext() {
        return {
            settings: get_store_value(this.effectiveSettings),
            dailyNotesIndex: get_store_value(this.dailyNotes),
            weeklyNotesIndex: get_store_value(this.weeklyNotes),
            onFileOpened: (file, selectedDailyDate) => {
                this.selection.activeFile.setFile(file, selectedDailyDate);
            },
        };
    }
    renderDiagnostics() {
        if (!this.diagnostics.length) {
            return;
        }
        const diagnosticsEl = this.containerEl.createDiv({
            cls: "erin-calendar-embed-diagnostics",
        });
        diagnosticsEl.setAttribute("role", "alert");
        diagnosticsEl.createEl("strong", { text: "Erin Calendar settings:" });
        const list = diagnosticsEl.createEl("ul");
        this.diagnostics.forEach((diagnostic) => {
            list.createEl("li", { text: diagnostic });
        });
    }
}

class CalendarPlugin extends obsidian.Plugin {
    async onload() {
        this.register(settings.subscribe((value) => {
            this.options = value;
        }));
        this.registerView(VIEW_TYPE_CALENDAR, (leaf) => (this.view = new CalendarView(leaf)));
        this.addCommand({
            id: "show-calendar-view",
            name: "Open view",
            callback: () => void this.initLeaf(),
        });
        this.addCommand({
            id: "open-weekly-note",
            name: "Open Weekly Note",
            checkCallback: (checking) => {
                if (checking) {
                    return !appHasPeriodicNotesPluginLoaded();
                }
                void this.getOrCreateCalendarView().then((view) => view.openOrCreateWeeklyNote(window.moment(), false));
            },
        });
        this.addCommand({
            id: "reveal-active-note",
            name: "Reveal active note",
            callback: () => void this.getOrCreateCalendarView().then((view) => view.revealActiveNote()),
        });
        await this.loadOptions();
        this.addSettingTab(new CalendarSettingsTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("erin-calendar", (source, el, ctx) => {
            ctx.addChild(new CalendarEmbed(el, this, source));
        });
    }
    async initLeaf() {
        const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
        if (existingLeaf) {
            // Reuse the user's existing placement instead of creating/moving a leaf.
            this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
            return existingLeaf.view;
        }
        const mode = this.app.vault.getConfig("defaultViewMode");
        const leaf = this.app.workspace.getRightLeaf(true);
        await leaf.setViewState({
            type: VIEW_TYPE_CALENDAR,
            state: { mode },
        });
        return leaf.view;
    }
    async getOrCreateCalendarView() {
        return this.initLeaf();
    }
    async loadOptions() {
        const options = await this.loadData();
        settings.update((old) => {
            return Object.assign(Object.assign({}, old), (options || {}));
        });
        await this.saveData(this.options);
    }
    async writeOptions(changeOpts) {
        settings.update((old) => (Object.assign(Object.assign({}, old), changeOpts(old))));
        await this.saveData(this.options);
    }
}

module.exports = CalendarPlugin;
