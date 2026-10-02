'use strict';

var require$$0 = require('obsidian');

const DEFAULT_WEEK_FORMAT = "gggg-[W]ww";
const DEFAULT_WORDS_PER_DOT = 250;
const VIEW_TYPE_CALENDAR = "calendar";
const TRIGGER_ON_OPEN = "calendar:open";

var main = {};

var hasRequiredMain;

function requireMain () {
	if (hasRequiredMain) return main;
	hasRequiredMain = 1;

	Object.defineProperty(main, '__esModule', { value: true });

	var obsidian = require$$0;

	const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
	const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
	const DEFAULT_MONTHLY_NOTE_FORMAT = "YYYY-MM";

	function shouldUsePeriodicNotesSettings(periodicity) {
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    const periodicNotes = window.app.plugins.getPlugin("periodic-notes");
	    return periodicNotes && periodicNotes.settings?.[periodicity]?.enabled;
	}
	/**
	 * Read the user settings for the `daily-notes` plugin
	 * to keep behavior of creating a new note in-sync.
	 */
	function getDailyNoteSettings() {
	    try {
	        // eslint-disable-next-line @typescript-eslint/no-explicit-any
	        const { internalPlugins, plugins } = window.app;
	        if (shouldUsePeriodicNotesSettings("daily")) {
	            const { format, folder, template } = plugins.getPlugin("periodic-notes")?.settings?.daily || {};
	            return {
	                format: format || DEFAULT_DAILY_NOTE_FORMAT,
	                folder: folder?.trim() || "",
	                template: template?.trim() || "",
	            };
	        }
	        const { folder, format, template } = internalPlugins.getPluginById("daily-notes")?.instance?.options || {};
	        return {
	            format: format || DEFAULT_DAILY_NOTE_FORMAT,
	            folder: folder?.trim() || "",
	            template: template?.trim() || "",
	        };
	    }
	    catch (err) {
	        console.info("No custom daily note settings found!", err);
	    }
	}
	/**
	 * Read the user settings for the `weekly-notes` plugin
	 * to keep behavior of creating a new note in-sync.
	 */
	function getWeeklyNoteSettings() {
	    try {
	        // eslint-disable-next-line @typescript-eslint/no-explicit-any
	        const pluginManager = window.app.plugins;
	        const calendarSettings = pluginManager.getPlugin("calendar")?.options;
	        const periodicNotesSettings = pluginManager.getPlugin("periodic-notes")
	            ?.settings?.weekly;
	        if (shouldUsePeriodicNotesSettings("weekly")) {
	            return {
	                format: periodicNotesSettings.format || DEFAULT_WEEKLY_NOTE_FORMAT,
	                folder: periodicNotesSettings.folder?.trim() || "",
	                template: periodicNotesSettings.template?.trim() || "",
	            };
	        }
	        const settings = calendarSettings || {};
	        return {
	            format: settings.weeklyNoteFormat || DEFAULT_WEEKLY_NOTE_FORMAT,
	            folder: settings.weeklyNoteFolder?.trim() || "",
	            template: settings.weeklyNoteTemplate?.trim() || "",
	        };
	    }
	    catch (err) {
	        console.info("No custom weekly note settings found!", err);
	    }
	}
	/**
	 * Read the user settings for the `periodic-notes` plugin
	 * to keep behavior of creating a new note in-sync.
	 */
	function getMonthlyNoteSettings() {
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    const pluginManager = window.app.plugins;
	    try {
	        const settings = (shouldUsePeriodicNotesSettings("monthly") &&
	            pluginManager.getPlugin("periodic-notes")?.settings?.monthly) ||
	            {};
	        return {
	            format: settings.format || DEFAULT_MONTHLY_NOTE_FORMAT,
	            folder: settings.folder?.trim() || "",
	            template: settings.template?.trim() || "",
	        };
	    }
	    catch (err) {
	        console.info("No custom monthly note settings found!", err);
	    }
	}

	/**
	 * dateUID is a way of weekly identifying daily/weekly/monthly notes.
	 * They are prefixed with the granularity to avoid ambiguity.
	 */
	function getDateUID(date, granularity = "day") {
	    const ts = date.clone().startOf(granularity).format();
	    return `${granularity}-${ts}`;
	}
	function removeEscapedCharacters(format) {
	    return format.replace(/\[[^\]]*\]/g, ""); // remove everything within brackets
	}
	/**
	 * XXX: When parsing dates that contain both week numbers and months,
	 * Moment choses to ignore the week numbers. For the week dateUID, we
	 * want the opposite behavior. Strip the MMM from the format to patch.
	 */
	function isFormatAmbiguous(format, granularity) {
	    if (granularity === "week") {
	        const cleanFormat = removeEscapedCharacters(format);
	        return (/w{1,2}/i.test(cleanFormat) &&
	            (/M{1,4}/.test(cleanFormat) || /D{1,4}/.test(cleanFormat)));
	    }
	    return false;
	}
	function getDateFromFile(file, granularity) {
	    const getSettings = {
	        day: getDailyNoteSettings,
	        week: getWeeklyNoteSettings,
	        month: getMonthlyNoteSettings,
	    };
	    const format = getSettings[granularity]().format.split("/").pop();
	    const noteDate = window.moment(file.basename, format, true);
	    if (!noteDate.isValid()) {
	        return null;
	    }
	    if (isFormatAmbiguous(format, granularity)) {
	        if (granularity === "week") {
	            const cleanFormat = removeEscapedCharacters(format);
	            if (/w{1,2}/i.test(cleanFormat)) {
	                return window.moment(file.basename,
	                // If format contains week, remove day & month formatting
	                format.replace(/M{1,4}/g, "").replace(/D{1,4}/g, ""), false);
	            }
	        }
	    }
	    return noteDate;
	}

	// Credit: @creationix/path.js
	function join(...partSegments) {
	    // Split the inputs into a list of path commands.
	    let parts = [];
	    for (let i = 0, l = partSegments.length; i < l; i++) {
	        parts = parts.concat(partSegments[i].split("/"));
	    }
	    // Interpret the path commands to get the new resolved path.
	    const newParts = [];
	    for (let i = 0, l = parts.length; i < l; i++) {
	        const part = parts[i];
	        // Remove leading and trailing slashes
	        // Also remove "." segments
	        if (!part || part === ".")
	            continue;
	        // Push new path segments.
	        else
	            newParts.push(part);
	    }
	    // Preserve the initial slash if there was one.
	    if (parts[0] === "")
	        newParts.unshift("");
	    // Turn back into a single string path.
	    return newParts.join("/");
	}
	async function ensureFolderExists(path) {
	    const dirs = path.replace(/\\/g, "/").split("/");
	    dirs.pop(); // remove basename
	    if (dirs.length) {
	        const dir = join(...dirs);
	        if (!window.app.vault.getAbstractFileByPath(dir)) {
	            await window.app.vault.createFolder(dir);
	        }
	    }
	}
	async function getNotePath(directory, filename) {
	    if (!filename.endsWith(".md")) {
	        filename += ".md";
	    }
	    const path = obsidian.normalizePath(join(directory, filename));
	    await ensureFolderExists(path);
	    return path;
	}
	async function getTemplateInfo(template) {
	    const { metadataCache, vault } = window.app;
	    const templatePath = obsidian.normalizePath(template);
	    if (templatePath === "/") {
	        return Promise.resolve(["", null]);
	    }
	    try {
	        const templateFile = metadataCache.getFirstLinkpathDest(templatePath, "");
	        const contents = await vault.cachedRead(templateFile);
	        // eslint-disable-next-line @typescript-eslint/no-explicit-any
	        const IFoldInfo = window.app.foldManager.load(templateFile);
	        return [contents, IFoldInfo];
	    }
	    catch (err) {
	        console.error(`Failed to read the daily note template '${templatePath}'`, err);
	        new obsidian.Notice("Failed to read the daily note template");
	        return ["", null];
	    }
	}

	class DailyNotesFolderMissingError extends Error {
	}
	/**
	 * This function mimics the behavior of the daily-notes plugin
	 * so it will replace {{date}}, {{title}}, and {{time}} with the
	 * formatted timestamp.
	 *
	 * Note: it has an added bonus that it's not 'today' specific.
	 */
	async function createDailyNote(date) {
	    const app = window.app;
	    const { vault } = app;
	    const moment = window.moment;
	    const { template, format, folder } = getDailyNoteSettings();
	    const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	    const filename = date.format(format);
	    const normalizedPath = await getNotePath(folder, filename);
	    try {
	        const createdFile = await vault.create(normalizedPath, templateContents
	            .replace(/{{\s*date\s*}}/gi, filename)
	            .replace(/{{\s*time\s*}}/gi, moment().format("HH:mm"))
	            .replace(/{{\s*title\s*}}/gi, filename)
	            .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
	            const now = moment();
	            const currentDate = date.clone().set({
	                hour: now.get("hour"),
	                minute: now.get("minute"),
	                second: now.get("second"),
	            });
	            if (calc) {
	                currentDate.add(parseInt(timeDelta, 10), unit);
	            }
	            if (momentFormat) {
	                return currentDate.format(momentFormat.substring(1).trim());
	            }
	            return currentDate.format(format);
	        })
	            .replace(/{{\s*yesterday\s*}}/gi, date.clone().subtract(1, "day").format(format))
	            .replace(/{{\s*tomorrow\s*}}/gi, date.clone().add(1, "d").format(format)));
	        // eslint-disable-next-line @typescript-eslint/no-explicit-any
	        app.foldManager.save(createdFile, IFoldInfo);
	        return createdFile;
	    }
	    catch (err) {
	        console.error(`Failed to create file: '${normalizedPath}'`, err);
	        new obsidian.Notice("Unable to create new file.");
	    }
	}
	function getDailyNote(date, dailyNotes) {
	    return dailyNotes[getDateUID(date, "day")] ?? null;
	}
	function getAllDailyNotes() {
	    /**
	     * Find all daily notes in the daily note folder
	     */
	    const { vault } = window.app;
	    const { folder } = getDailyNoteSettings();
	    const dailyNotesFolder = vault.getAbstractFileByPath(obsidian.normalizePath(folder));
	    if (!dailyNotesFolder) {
	        throw new DailyNotesFolderMissingError("Failed to find daily notes folder");
	    }
	    const dailyNotes = {};
	    obsidian.Vault.recurseChildren(dailyNotesFolder, (note) => {
	        if (note instanceof obsidian.TFile) {
	            const date = getDateFromFile(note, "day");
	            if (date) {
	                const dateString = getDateUID(date, "day");
	                dailyNotes[dateString] = note;
	            }
	        }
	    });
	    return dailyNotes;
	}

	class WeeklyNotesFolderMissingError extends Error {
	}
	function getDaysOfWeek() {
	    const { moment } = window;
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    let weekStart = moment.localeData()._week.dow;
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
	        weekStart--;
	    }
	    return daysOfWeek;
	}
	function getDayOfWeekNumericalValue(dayOfWeekName) {
	    return getDaysOfWeek().indexOf(dayOfWeekName.toLowerCase());
	}
	async function createWeeklyNote(date) {
	    const { vault } = window.app;
	    const { template, format, folder } = getWeeklyNoteSettings();
	    const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	    const filename = date.format(format);
	    const normalizedPath = await getNotePath(folder, filename);
	    try {
	        const createdFile = await vault.create(normalizedPath, templateContents
	            .replace(/{{\s*(date|time)\s*(([+-]\d+)([yqmwdhs]))?\s*(:.+?)?}}/gi, (_, _timeOrDate, calc, timeDelta, unit, momentFormat) => {
	            const now = window.moment();
	            const currentDate = date.clone().set({
	                hour: now.get("hour"),
	                minute: now.get("minute"),
	                second: now.get("second"),
	            });
	            if (calc) {
	                currentDate.add(parseInt(timeDelta, 10), unit);
	            }
	            if (momentFormat) {
	                return currentDate.format(momentFormat.substring(1).trim());
	            }
	            return currentDate.format(format);
	        })
	            .replace(/{{\s*title\s*}}/gi, filename)
	            .replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm"))
	            .replace(/{{\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s*:(.*?)}}/gi, (_, dayOfWeek, momentFormat) => {
	            const day = getDayOfWeekNumericalValue(dayOfWeek);
	            return date.weekday(day).format(momentFormat.trim());
	        }));
	        // eslint-disable-next-line @typescript-eslint/no-explicit-any
	        window.app.foldManager.save(createdFile, IFoldInfo);
	        return createdFile;
	    }
	    catch (err) {
	        console.error(`Failed to create file: '${normalizedPath}'`, err);
	        new obsidian.Notice("Unable to create new file.");
	    }
	}
	function getWeeklyNote(date, weeklyNotes) {
	    return weeklyNotes[getDateUID(date, "week")] ?? null;
	}
	function getAllWeeklyNotes() {
	    const { vault } = window.app;
	    const { folder } = getWeeklyNoteSettings();
	    const weeklyNotesFolder = vault.getAbstractFileByPath(obsidian.normalizePath(folder));
	    if (!weeklyNotesFolder) {
	        throw new WeeklyNotesFolderMissingError("Failed to find weekly notes folder");
	    }
	    const weeklyNotes = {};
	    obsidian.Vault.recurseChildren(weeklyNotesFolder, (note) => {
	        if (note instanceof obsidian.TFile) {
	            const date = getDateFromFile(note, "week");
	            if (date) {
	                const dateString = getDateUID(date, "week");
	                weeklyNotes[dateString] = note;
	            }
	        }
	    });
	    return weeklyNotes;
	}

	class MonthlyNotesFolderMissingError extends Error {
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
	    const { template, format, folder } = getMonthlyNoteSettings();
	    const [templateContents, IFoldInfo] = await getTemplateInfo(template);
	    const filename = date.format(format);
	    const normalizedPath = await getNotePath(folder, filename);
	    try {
	        const createdFile = await vault.create(normalizedPath, templateContents
	            .replace(/{{\s*(date|time)\s*:(.*?)}}/gi, (_, _timeOrDate, momentFormat) => {
	            const now = window.moment();
	            return date
	                .set({
	                hour: now.get("hour"),
	                minute: now.get("minute"),
	                second: now.get("second"),
	            })
	                .format(momentFormat.trim());
	        })
	            .replace(/{{\s*date\s*}}/gi, filename)
	            .replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm"))
	            .replace(/{{\s*title\s*}}/gi, filename));
	        // eslint-disable-next-line @typescript-eslint/no-explicit-any
	        window.app.foldManager.save(createdFile, IFoldInfo);
	        return createdFile;
	    }
	    catch (err) {
	        console.error(`Failed to create file: '${normalizedPath}'`, err);
	        new obsidian.Notice("Unable to create new file.");
	    }
	}
	function getMonthlyNote(date, monthlyNotes) {
	    return monthlyNotes[getDateUID(date, "month")] ?? null;
	}
	function getAllMonthlyNotes() {
	    const { vault } = window.app;
	    const { folder } = getMonthlyNoteSettings();
	    const monthlyNotesFolder = vault.getAbstractFileByPath(obsidian.normalizePath(folder));
	    if (!monthlyNotesFolder) {
	        throw new MonthlyNotesFolderMissingError("Failed to find monthly notes folder");
	    }
	    const monthlyNotes = {};
	    obsidian.Vault.recurseChildren(monthlyNotesFolder, (note) => {
	        if (note instanceof obsidian.TFile) {
	            const date = getDateFromFile(note, "month");
	            if (date) {
	                const dateString = getDateUID(date, "month");
	                monthlyNotes[dateString] = note;
	            }
	        }
	    });
	    return monthlyNotes;
	}

	function appHasDailyNotesPluginLoaded() {
	    const { app } = window;
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    const dailyNotesPlugin = app.internalPlugins.plugins["daily-notes"];
	    if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
	        return true;
	    }
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    const periodicNotes = app.plugins.getPlugin("periodic-notes");
	    return periodicNotes && periodicNotes.settings?.daily?.enabled;
	}
	/**
	 * XXX: "Weekly Notes" live in either the Calendar plugin or the periodic-notes plugin.
	 * Check both until the weekly notes feature is removed from the Calendar plugin.
	 */
	function appHasWeeklyNotesPluginLoaded() {
	    const { app } = window;
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    if (app.plugins.getPlugin("calendar")) {
	        return true;
	    }
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    const periodicNotes = app.plugins.getPlugin("periodic-notes");
	    return periodicNotes && periodicNotes.settings?.weekly?.enabled;
	}
	function appHasMonthlyNotesPluginLoaded() {
	    const { app } = window;
	    // eslint-disable-next-line @typescript-eslint/no-explicit-any
	    const periodicNotes = app.plugins.getPlugin("periodic-notes");
	    return periodicNotes && periodicNotes.settings?.monthly?.enabled;
	}

	main.DEFAULT_DAILY_NOTE_FORMAT = DEFAULT_DAILY_NOTE_FORMAT;
	main.DEFAULT_MONTHLY_NOTE_FORMAT = DEFAULT_MONTHLY_NOTE_FORMAT;
	main.DEFAULT_WEEKLY_NOTE_FORMAT = DEFAULT_WEEKLY_NOTE_FORMAT;
	main.appHasDailyNotesPluginLoaded = appHasDailyNotesPluginLoaded;
	main.appHasMonthlyNotesPluginLoaded = appHasMonthlyNotesPluginLoaded;
	main.appHasWeeklyNotesPluginLoaded = appHasWeeklyNotesPluginLoaded;
	main.createDailyNote = createDailyNote;
	main.createMonthlyNote = createMonthlyNote;
	main.createWeeklyNote = createWeeklyNote;
	main.getAllDailyNotes = getAllDailyNotes;
	main.getAllMonthlyNotes = getAllMonthlyNotes;
	main.getAllWeeklyNotes = getAllWeeklyNotes;
	main.getDailyNote = getDailyNote;
	main.getDailyNoteSettings = getDailyNoteSettings;
	main.getDateFromFile = getDateFromFile;
	main.getDateUID = getDateUID;
	main.getMonthlyNote = getMonthlyNote;
	main.getMonthlyNoteSettings = getMonthlyNoteSettings;
	main.getTemplateInfo = getTemplateInfo;
	main.getWeeklyNote = getWeeklyNote;
	main.getWeeklyNoteSettings = getWeeklyNoteSettings;
	return main;
}

var mainExports = requireMain();

function noop() { }
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
function component_subscribe(component, store, callback) {
    component.$$.on_destroy.push(subscribe(store, callback));
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function element(name) {
    return document.createElement(name);
}
function children(element) {
    return Array.from(element.childNodes);
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
function afterUpdate(fn) {
    get_current_component().$$.after_update.push(fn);
}
function onDestroy(fn) {
    get_current_component().$$.on_destroy.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
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
let flushing = false;
const seen_callbacks = new Set();
function flush() {
    if (flushing)
        return;
    flushing = true;
    do {
        // first, call beforeUpdate functions
        // and update components
        for (let i = 0; i < dirty_components.length; i += 1) {
            const component = dirty_components[i];
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
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
    flushing = false;
    seen_callbacks.clear();
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
const outroing = new Set();
let outros;
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
        });
        block.o(local);
    }
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
    const { fragment, on_mount, on_destroy, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
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
function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: null,
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
        context: new Map(parent_component ? parent_component.$$.context : []),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false
    };
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
 * @param {StartStopNotifier=}start start and stop notifications for subscriptions
 */
function writable(value, start = noop) {
    let stop;
    const subscribers = [];
    function set(new_value) {
        if (safe_not_equal(value, new_value)) {
            value = new_value;
            if (stop) { // store is ready
                const run_queue = !subscriber_queue.length;
                for (let i = 0; i < subscribers.length; i += 1) {
                    const s = subscribers[i];
                    s[1]();
                    subscriber_queue.push(s, value);
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
        subscribers.push(subscriber);
        if (subscribers.length === 1) {
            stop = start(set) || noop;
        }
        run(value);
        return () => {
            const index = subscribers.indexOf(subscriber);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
            if (subscribers.length === 0) {
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
    shouldConfirmBeforeCreate: true,
    weekStart: "locale",
    wordsPerDot: DEFAULT_WORDS_PER_DOT,
    weekdayLabelFormat: "ddd",
    showWeeklyNote: false,
    weeklyNoteFormat: "",
    weeklyNoteTemplate: "",
    weeklyNoteFolder: "",
    localeOverride: "system-default",
});
function appHasPeriodicNotesPluginLoaded() {
    var _a, _b;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodicNotes = window.app.plugins.getPlugin("periodic-notes");
    return periodicNotes && ((_b = (_a = periodicNotes.settings) === null || _a === void 0 ? void 0 : _a.weekly) === null || _b === void 0 ? void 0 : _b.enabled);
}
class CalendarSettingsTab extends require$$0.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        this.containerEl.empty();
        if (!mainExports.appHasDailyNotesPluginLoaded()) {
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
        this.addWeekdayLabelFormatSetting();
        this.addWeekStartSetting();
        this.addConfirmCreateSetting();
        this.addShowWeeklyNoteSetting();
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
        new require$$0.Setting(this.containerEl)
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
    addWeekStartSetting() {
        var _a, _b;
        const { moment } = window;
        const localizedWeekdays = moment.weekdays();
        // `dow` can legitimately be 0 (Sunday), so use nullish fallback rather
        // than `|| 1`. Some locales do not populate Obsidian's bundled week spec.
        const localeWeekStartNum = (_b = (_a = window._bundledLocaleWeekSpec) === null || _a === void 0 ? void 0 : _a.dow) !== null && _b !== void 0 ? _b : 1;
        const localeWeekStart = moment.weekdays()[localeWeekStartNum];
        new require$$0.Setting(this.containerEl)
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
        new require$$0.Setting(this.containerEl)
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
        new require$$0.Setting(this.containerEl)
            .setName("Weekday label format")
            .setDesc("Moment.js format for weekday headings: ddd for Mon, dd for Mo, or d for M.")
            .addText((textfield) => {
            textfield.setPlaceholder("ddd");
            textfield.setValue(this.plugin.options.weekdayLabelFormat || "ddd");
            textfield.onChange(async (value) => {
                await this.plugin.writeOptions(() => ({ weekdayLabelFormat: value.trim() || "ddd" }));
            });
        });
    }
    addShowWeeklyNoteSetting() {
        new require$$0.Setting(this.containerEl)
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
    addWeeklyNoteFormatSetting() {
        new require$$0.Setting(this.containerEl)
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
        new require$$0.Setting(this.containerEl)
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
        new require$$0.Setting(this.containerEl)
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
        new require$$0.Setting(this.containerEl)
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
 * Lookup the dateUID for a given file. It compares the filename
 * to the daily and weekly note formats to find a match.
 *
 * @param file
 */
function getDateUIDFromFile(file) {
    if (!file) {
        return null;
    }
    // TODO: I'm not checking the path!
    let date = mainExports.getDateFromFile(file, "day");
    if (date) {
        return mainExports.getDateUID(date, "day");
    }
    date = mainExports.getDateFromFile(file, "week");
    if (date) {
        return mainExports.getDateUID(date, "week");
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

function createDailyNotesStore() {
    let hasError = false;
    const store = writable(null);
    return Object.assign({ reindex: () => {
            try {
                const dailyNotes = mainExports.getAllDailyNotes();
                store.set(dailyNotes);
                hasError = false;
            }
            catch (err) {
                if (!hasError) {
                    // Avoid error being shown multiple times
                    console.log("[Calendar] Failed to find daily notes folder", err);
                }
                store.set({});
                hasError = true;
            }
        } }, store);
}
function createWeeklyNotesStore() {
    let hasError = false;
    const store = writable(null);
    return Object.assign({ reindex: () => {
            try {
                const weeklyNotes = mainExports.getAllWeeklyNotes();
                store.set(weeklyNotes);
                hasError = false;
            }
            catch (err) {
                if (!hasError) {
                    // Avoid error being shown multiple times
                    console.log("[Calendar] Failed to find weekly notes folder", err);
                }
                store.set({});
                hasError = true;
            }
        } }, store);
}
const settings$1 = writable(defaultSettings);
const dailyNotes = createDailyNotesStore();
const weeklyNotes = createWeeklyNotesStore();
function createSelectedFileStore() {
    const store = writable(null);
    return Object.assign({ setFile: (file) => {
            const id = getDateUIDFromFile(file);
            store.set(id);
        } }, store);
}
const activeFile$1 = createSelectedFileStore();

class ConfirmationModal extends require$$0.Modal {
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

/**
 * Create a Daily Note for a given date.
 */
async function tryToCreateDailyNote(date, inNewSplit, settings, cb) {
    const { workspace } = window.app;
    const { format } = mainExports.getDailyNoteSettings();
    const filename = date.format(format);
    const createFile = async () => {
        const dailyNote = await mainExports.createDailyNote(date);
        const leaf = inNewSplit
            ? workspace.splitActiveLeaf()
            : workspace.getUnpinnedLeaf();
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

/**
 * Create a Weekly Note for a given date.
 */
async function tryToCreateWeeklyNote(date, inNewSplit, settings, cb) {
    const { workspace } = window.app;
    const { format } = mainExports.getWeeklyNoteSettings();
    const filename = date.format(format);
    const createFile = async () => {
        const dailyNote = await mainExports.createWeeklyNote(date);
        const leaf = inNewSplit
            ? workspace.splitActiveLeaf()
            : workspace.getUnpinnedLeaf();
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

Promise.resolve();

const langToMomentLocale = {
    en: "en-gb",
    zh: "zh-cn",
    "zh-TW": "zh-tw",
    ru: "ru",
    ko: "ko",
    it: "it",
    id: "id",
    ro: "ro",
    "pt-BR": "pt-br",
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
function overrideGlobalMomentWeekStart(weekStart) {
    const { moment } = window;
    const currentLocale = moment.locale();
    // Save the initial locale weekspec so that we can restore
    // it when toggling between the different options in settings.
    if (!window._bundledLocaleWeekSpec) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window._bundledLocaleWeekSpec = moment.localeData()._week;
    }
    if (weekStart === "locale") {
        moment.updateLocale(currentLocale, {
            week: window._bundledLocaleWeekSpec,
        });
    }
    else {
        moment.updateLocale(currentLocale, {
            week: {
                dow: weekdays.indexOf(weekStart) || 0,
            },
        });
    }
}
/**
 * Sets the locale used by the calendar. This allows the calendar to
 * default to the user's locale (e.g. Start Week on Sunday/Monday/Friday)
 *
 * @param localeOverride locale string (e.g. "en-US")
 */
function configureGlobalMomentLocale(localeOverride = "system-default", weekStart = "locale") {
    var _a;
    const obsidianLang = localStorage.getItem("language") || "en";
    const systemLang = (_a = navigator.language) === null || _a === void 0 ? void 0 : _a.toLowerCase();
    let momentLocale = langToMomentLocale[obsidianLang];
    if (localeOverride !== "system-default") {
        momentLocale = localeOverride;
    }
    else if (systemLang.startsWith(obsidianLang)) {
        // If the system locale is more specific (en-gb vs en), use the system locale.
        momentLocale = systemLang;
    }
    const currentLocale = window.moment.locale(momentLocale);
    console.debug(`[Calendar] Trying to switch Moment.js global locale to ${momentLocale}, got ${currentLocale}`);
    overrideGlobalMomentWeekStart(weekStart);
    return currentLocale;
}

/* src/ui/Calendar.svelte generated by Svelte v3.35.0 */

function create_fragment(ctx) {
	let div;
	let calendarbase;
	let updating_displayedMonth;
	let current;

	function calendarbase_displayedMonth_binding(value) {
		/*calendarbase_displayedMonth_binding*/ ctx[13](value);
	}

	let calendarbase_props = {
		sources: /*sources*/ ctx[1],
		today: /*today*/ ctx[9],
		onHoverDay: /*onHoverDay*/ ctx[2],
		onHoverWeek: /*onHoverWeek*/ ctx[3],
		onContextMenuDay: /*onContextMenuDay*/ ctx[6],
		onContextMenuWeek: /*onContextMenuWeek*/ ctx[7],
		onClickDay: /*onClickDay*/ ctx[4],
		onClickWeek: /*onClickWeek*/ ctx[5],
		localeData: /*today*/ ctx[9].localeData(),
		selectedId: /*$activeFile*/ ctx[11],
		showWeekNums: /*$settings*/ ctx[8].showWeeklyNote
	};

	if (/*displayedMonth*/ ctx[0] !== void 0) {
		calendarbase_props.displayedMonth = /*displayedMonth*/ ctx[0];
	}

	calendarbase = new CalendarBase({ props: calendarbase_props });
	binding_callbacks.push(() => bind(calendarbase, "displayedMonth", calendarbase_displayedMonth_binding));

	return {
		c() {
			div = element("div");
			create_component(calendarbase.$$.fragment);
		},
		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(calendarbase, div, null);
			/*div_binding*/ ctx[14](div);
			current = true;
		},
		p(ctx, [dirty]) {
			const calendarbase_changes = {};
			if (dirty & /*sources*/ 2) calendarbase_changes.sources = /*sources*/ ctx[1];
			if (dirty & /*today*/ 512) calendarbase_changes.today = /*today*/ ctx[9];
			if (dirty & /*onHoverDay*/ 4) calendarbase_changes.onHoverDay = /*onHoverDay*/ ctx[2];
			if (dirty & /*onHoverWeek*/ 8) calendarbase_changes.onHoverWeek = /*onHoverWeek*/ ctx[3];
			if (dirty & /*onContextMenuDay*/ 64) calendarbase_changes.onContextMenuDay = /*onContextMenuDay*/ ctx[6];
			if (dirty & /*onContextMenuWeek*/ 128) calendarbase_changes.onContextMenuWeek = /*onContextMenuWeek*/ ctx[7];
			if (dirty & /*onClickDay*/ 16) calendarbase_changes.onClickDay = /*onClickDay*/ ctx[4];
			if (dirty & /*onClickWeek*/ 32) calendarbase_changes.onClickWeek = /*onClickWeek*/ ctx[5];
			if (dirty & /*today*/ 512) calendarbase_changes.localeData = /*today*/ ctx[9].localeData();
			if (dirty & /*$activeFile*/ 2048) calendarbase_changes.selectedId = /*$activeFile*/ ctx[11];
			if (dirty & /*$settings*/ 256) calendarbase_changes.showWeekNums = /*$settings*/ ctx[8].showWeeklyNote;

			if (!updating_displayedMonth && dirty & /*displayedMonth*/ 1) {
				updating_displayedMonth = true;
				calendarbase_changes.displayedMonth = /*displayedMonth*/ ctx[0];
				add_flush_callback(() => updating_displayedMonth = false);
			}

			calendarbase.$set(calendarbase_changes);
		},
		i(local) {
			if (current) return;
			transition_in(calendarbase.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(calendarbase.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_component(calendarbase);
			/*div_binding*/ ctx[14](null);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let $settings;
	let $activeFile;
	component_subscribe($$self, settings, $$value => $$invalidate(8, $settings = $$value));
	component_subscribe($$self, activeFile, $$value => $$invalidate(11, $activeFile = $$value));
	let today;
	let calendarEl;
	let { displayedMonth = today } = $$props;
	let { sources } = $$props;
	let { onHoverDay } = $$props;
	let { onHoverWeek } = $$props;
	let { onClickDay } = $$props;
	let { onClickWeek } = $$props;
	let { onContextMenuDay } = $$props;
	let { onContextMenuWeek } = $$props;

	function tick() {
		$$invalidate(9, today = window.moment());
	}

	function getToday(settings) {
		configureGlobalMomentLocale(settings.localeOverride, settings.weekStart);
		dailyNotes.reindex();
		weeklyNotes.reindex();
		return window.moment();
	}

	afterUpdate(() => {
		const format = $settings.weekdayLabelFormat || "ddd";

		calendarEl === null || calendarEl === void 0
		? void 0
		: calendarEl.querySelectorAll("thead th").forEach((heading, index) => {
				if ($settings.showWeeklyNote && index === 0) return;
				const dayIndex = $settings.showWeeklyNote ? index - 1 : index;
				heading.textContent = today.clone().startOf("week").add(dayIndex, "day").format(format);
			});
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

	function calendarbase_displayedMonth_binding(value) {
		displayedMonth = value;
		$$invalidate(0, displayedMonth);
	}

	function div_binding($$value) {
		binding_callbacks[$$value ? "unshift" : "push"](() => {
			calendarEl = $$value;
			$$invalidate(10, calendarEl);
		});
	}

	$$self.$$set = $$props => {
		if ("displayedMonth" in $$props) $$invalidate(0, displayedMonth = $$props.displayedMonth);
		if ("sources" in $$props) $$invalidate(1, sources = $$props.sources);
		if ("onHoverDay" in $$props) $$invalidate(2, onHoverDay = $$props.onHoverDay);
		if ("onHoverWeek" in $$props) $$invalidate(3, onHoverWeek = $$props.onHoverWeek);
		if ("onClickDay" in $$props) $$invalidate(4, onClickDay = $$props.onClickDay);
		if ("onClickWeek" in $$props) $$invalidate(5, onClickWeek = $$props.onClickWeek);
		if ("onContextMenuDay" in $$props) $$invalidate(6, onContextMenuDay = $$props.onContextMenuDay);
		if ("onContextMenuWeek" in $$props) $$invalidate(7, onContextMenuWeek = $$props.onContextMenuWeek);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*$settings*/ 256) {
			$$invalidate(9, today = getToday($settings));
		}
	};

	return [
		displayedMonth,
		sources,
		onHoverDay,
		onHoverWeek,
		onClickDay,
		onClickWeek,
		onContextMenuDay,
		onContextMenuWeek,
		$settings,
		today,
		calendarEl,
		$activeFile,
		tick,
		calendarbase_displayedMonth_binding,
		div_binding
	];
}

class Calendar extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, not_equal, {
			displayedMonth: 0,
			sources: 1,
			onHoverDay: 2,
			onHoverWeek: 3,
			onClickDay: 4,
			onClickWeek: 5,
			onContextMenuDay: 6,
			onContextMenuWeek: 7,
			tick: 12
		});
	}

	get tick() {
		return this.$$.ctx[12];
	}
}

function showFileMenu(app, file, position) {
    const fileMenu = new require$$0.Menu();
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

const getStreakClasses = (file) => {
    return classList({
        "has-note": !!file,
    });
};
const streakSource = {
    getDailyMetadata: async (date) => {
        const file = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        return {
            classes: getStreakClasses(file),
            dots: [],
        };
    },
    getWeeklyMetadata: async (date) => {
        const file = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        return {
            classes: getStreakClasses(file),
            dots: [],
        };
    },
};

function getNoteTags(note) {
    var _a;
    if (!note) {
        return [];
    }
    const { metadataCache } = window.app;
    const frontmatter = (_a = metadataCache.getFileCache(note)) === null || _a === void 0 ? void 0 : _a.frontmatter;
    const tags = [];
    if (frontmatter) {
        const frontmatterTags = require$$0.parseFrontMatterTags(frontmatter) || [];
        tags.push(...frontmatterTags);
    }
    // strip the '#' at the beginning
    return tags.map((tag) => tag.substring(1));
}
function getFormattedTagAttributes(note) {
    const attrs = {};
    const tags = getNoteTags(note);
    const [emojiTags, nonEmojiTags] = partition(tags, (tag) => /(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/.test(tag));
    if (nonEmojiTags) {
        attrs["data-tags"] = nonEmojiTags.join(" ");
    }
    if (emojiTags) {
        attrs["data-emoji-tag"] = emojiTags[0];
    }
    return attrs;
}
const customTagsSource = {
    getDailyMetadata: async (date) => {
        const file = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        return {
            dataAttributes: getFormattedTagAttributes(file),
            dots: [],
        };
    },
    getWeeklyMetadata: async (date) => {
        const file = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        return {
            dataAttributes: getFormattedTagAttributes(file),
            dots: [],
        };
    },
};

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
const tasksSource = {
    getDailyMetadata: async (date) => {
        const file = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        const dots = await getDotsForDailyNote$1(file);
        return {
            dots,
        };
    },
    getWeeklyMetadata: async (date) => {
        const file = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        const dots = await getDotsForDailyNote$1(file);
        return {
            dots,
        };
    },
};

const NUM_MAX_DOTS = 5;
async function getWordLengthAsDots(note) {
    const { wordsPerDot = DEFAULT_WORDS_PER_DOT } = get_store_value(settings$1);
    if (!note || wordsPerDot <= 0) {
        return 0;
    }
    const fileContents = await window.app.vault.cachedRead(note);
    const wordCount = getWordCount(fileContents);
    const numDots = wordCount / wordsPerDot;
    return clamp(Math.floor(numDots), 1, NUM_MAX_DOTS);
}
async function getDotsForDailyNote(dailyNote) {
    if (!dailyNote) {
        return [];
    }
    const numSolidDots = await getWordLengthAsDots(dailyNote);
    const dots = [];
    for (let i = 0; i < numSolidDots; i++) {
        dots.push({
            color: "default",
            isFilled: true,
        });
    }
    return dots;
}
const wordCountSource = {
    getDailyMetadata: async (date) => {
        const file = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        const dots = await getDotsForDailyNote(file);
        return {
            dots,
        };
    },
    getWeeklyMetadata: async (date) => {
        const file = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        const dots = await getDotsForDailyNote(file);
        return {
            dots,
        };
    },
};

class CalendarView extends require$$0.ItemView {
    constructor(leaf) {
        super(leaf);
        this.openOrCreateDailyNote = this.openOrCreateDailyNote.bind(this);
        this.openOrCreateWeeklyNote = this.openOrCreateWeeklyNote.bind(this);
        this.onNoteSettingsUpdate = this.onNoteSettingsUpdate.bind(this);
        this.onFileCreated = this.onFileCreated.bind(this);
        this.onFileDeleted = this.onFileDeleted.bind(this);
        this.onFileModified = this.onFileModified.bind(this);
        this.onFileOpen = this.onFileOpen.bind(this);
        this.onHoverDay = this.onHoverDay.bind(this);
        this.onHoverWeek = this.onHoverWeek.bind(this);
        this.onContextMenuDay = this.onContextMenuDay.bind(this);
        this.onContextMenuWeek = this.onContextMenuWeek.bind(this);
        this.registerEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.app.workspace.on("periodic-notes:settings-updated", this.onNoteSettingsUpdate));
        this.registerEvent(this.app.vault.on("create", this.onFileCreated));
        this.registerEvent(this.app.vault.on("delete", this.onFileDeleted));
        this.registerEvent(this.app.vault.on("modify", this.onFileModified));
        this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen));
        this.settings = null;
        settings$1.subscribe((val) => {
            this.settings = val;
            // Refresh the calendar if settings change
            if (this.calendar) {
                this.calendar.tick();
            }
        });
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
        if (this.calendar) {
            this.calendar.$destroy();
        }
        return Promise.resolve();
    }
    async onOpen() {
        // Integration point: external plugins can listen for `calendar:open`
        // to feed in additional sources.
        const sources = [
            customTagsSource,
            streakSource,
            wordCountSource,
            tasksSource,
        ];
        this.app.workspace.trigger(TRIGGER_ON_OPEN, sources);
        this.calendar = new Calendar({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            target: this.contentEl,
            props: {
                onClickDay: this.openOrCreateDailyNote,
                onClickWeek: this.openOrCreateWeeklyNote,
                onHoverDay: this.onHoverDay,
                onHoverWeek: this.onHoverWeek,
                onContextMenuDay: this.onContextMenuDay,
                onContextMenuWeek: this.onContextMenuWeek,
                sources,
            },
        });
    }
    onHoverDay(date, targetEl, isMetaPressed) {
        if (!isMetaPressed) {
            return;
        }
        const { format } = mainExports.getDailyNoteSettings();
        const note = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        this.app.workspace.trigger("link-hover", this, targetEl, date.format(format), note === null || note === void 0 ? void 0 : note.path);
    }
    onHoverWeek(date, targetEl, isMetaPressed) {
        if (!isMetaPressed) {
            return;
        }
        const note = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        const { format } = mainExports.getWeeklyNoteSettings();
        this.app.workspace.trigger("link-hover", this, targetEl, date.format(format), note === null || note === void 0 ? void 0 : note.path);
    }
    onContextMenuDay(date, event) {
        const note = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        if (!note) {
            // If no file exists for a given day, show nothing.
            return;
        }
        showFileMenu(this.app, note, {
            x: event.pageX,
            y: event.pageY,
        });
    }
    onContextMenuWeek(date, event) {
        const note = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        if (!note) {
            // If no file exists for a given day, show nothing.
            return;
        }
        showFileMenu(this.app, note, {
            x: event.pageX,
            y: event.pageY,
        });
    }
    onNoteSettingsUpdate() {
        dailyNotes.reindex();
        weeklyNotes.reindex();
        this.updateActiveFile();
    }
    async onFileDeleted(file) {
        if (mainExports.getDateFromFile(file, "day")) {
            dailyNotes.reindex();
            this.updateActiveFile();
        }
        if (mainExports.getDateFromFile(file, "week")) {
            weeklyNotes.reindex();
            this.updateActiveFile();
        }
    }
    async onFileModified(file) {
        const date = mainExports.getDateFromFile(file, "day") || mainExports.getDateFromFile(file, "week");
        if (date && this.calendar) {
            this.calendar.tick();
        }
    }
    onFileCreated(file) {
        if (this.app.workspace.layoutReady && this.calendar) {
            if (mainExports.getDateFromFile(file, "day")) {
                dailyNotes.reindex();
                this.calendar.tick();
            }
            if (mainExports.getDateFromFile(file, "week")) {
                weeklyNotes.reindex();
                this.calendar.tick();
            }
        }
    }
    onFileOpen(_file) {
        if (this.app.workspace.layoutReady) {
            this.updateActiveFile();
        }
    }
    updateActiveFile() {
        const { view } = this.app.workspace.activeLeaf || {};
        let file = null;
        if (view instanceof require$$0.FileView) {
            file = view.file;
        }
        activeFile$1.setFile(file);
        if (this.calendar) {
            this.calendar.tick();
        }
    }
    revealActiveNote() {
        const { moment } = window;
        const { activeLeaf } = this.app.workspace;
        if ((activeLeaf === null || activeLeaf === void 0 ? void 0 : activeLeaf.view) instanceof require$$0.FileView) {
            // Check to see if the active note is a daily-note
            let date = mainExports.getDateFromFile(activeLeaf.view.file, "day");
            if (date) {
                this.calendar.$set({ displayedMonth: date });
                return;
            }
            // Check to see if the active note is a weekly-note
            const { format } = mainExports.getWeeklyNoteSettings();
            date = moment(activeLeaf.view.file.basename, format, true);
            if (date.isValid()) {
                this.calendar.$set({ displayedMonth: date });
                return;
            }
        }
    }
    async openOrCreateWeeklyNote(date, inNewSplit) {
        const { workspace } = this.app;
        const startOfWeek = date.clone().startOf("week");
        const existingFile = mainExports.getWeeklyNote(date, get_store_value(weeklyNotes));
        if (!existingFile) {
            // File doesn't exist
            tryToCreateWeeklyNote(startOfWeek, inNewSplit, this.settings, (file) => {
                activeFile$1.setFile(file);
            });
            return;
        }
        const leaf = inNewSplit
            ? workspace.splitActiveLeaf()
            : workspace.getUnpinnedLeaf();
        await leaf.openFile(existingFile);
        activeFile$1.setFile(existingFile);
        workspace.setActiveLeaf(leaf, true, true);
    }
    async openOrCreateDailyNote(date, inNewSplit) {
        const { workspace } = this.app;
        const existingFile = mainExports.getDailyNote(date, get_store_value(dailyNotes));
        if (!existingFile) {
            // File doesn't exist
            tryToCreateDailyNote(date, inNewSplit, this.settings, (dailyNote) => {
                activeFile$1.setFile(dailyNote);
            });
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mode = this.app.vault.getConfig("defaultViewMode");
        const leaf = inNewSplit
            ? workspace.splitActiveLeaf()
            : workspace.getUnpinnedLeaf();
        await leaf.openFile(existingFile, { active: true, state: { mode } });
        activeFile$1.setFile(existingFile);
    }
}

/** Renders ```erin-calendar blocks in reading view. */
class CalendarEmbed extends require$$0.MarkdownRenderChild {
    constructor(containerEl, plugin) {
        super(containerEl);
        this.plugin = plugin;
        this.calendar = null;
    }
    onload() {
        this.containerEl.addClass("erin-calendar-embed");
        this.calendar = new Calendar({
            target: this.containerEl,
            props: {
                onClickDay: async (date, inNewSplit) => (await this.plugin.getOrCreateCalendarView()).openOrCreateDailyNote(date, inNewSplit),
                onClickWeek: async (date, inNewSplit) => (await this.plugin.getOrCreateCalendarView()).openOrCreateWeeklyNote(date, inNewSplit),
                onHoverDay: () => undefined,
                onHoverWeek: () => undefined,
                onContextMenuDay: () => undefined,
                onContextMenuWeek: () => undefined,
                sources: [customTagsSource, streakSource, wordCountSource, tasksSource],
            },
        });
    }
    onunload() {
        var _a;
        (_a = this.calendar) === null || _a === void 0 ? void 0 : _a.$destroy();
        this.calendar = null;
    }
}

class CalendarPlugin extends require$$0.Plugin {
    onunload() {
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_CALENDAR)
            .forEach((leaf) => leaf.detach());
    }
    async onload() {
        this.register(settings$1.subscribe((value) => {
            this.options = value;
        }));
        this.registerView(VIEW_TYPE_CALENDAR, (leaf) => (this.view = new CalendarView(leaf)));
        this.addCommand({
            id: "show-calendar-view",
            name: "Open view",
            checkCallback: (checking) => {
                if (checking) {
                    return (this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).length === 0);
                }
                this.initLeaf();
            },
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
        this.registerMarkdownCodeBlockProcessor("erin-calendar", (_source, el, ctx) => {
            ctx.addChild(new CalendarEmbed(el, this));
        });
        if (this.app.workspace.layoutReady) {
            void this.initLeaf();
        }
        else {
            this.registerEvent(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.app.workspace.on("layout-ready", () => void this.initLeaf()));
        }
    }
    async initLeaf() {
        const existingLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
        if (existingLeaf)
            return existingLeaf.view;
        const mode = this.app.vault.getConfig("defaultViewMode");
        const leaf = this.app.workspace.getRightLeaf(false);
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
        settings$1.update((old) => {
            return Object.assign(Object.assign({}, old), (options || {}));
        });
        await this.saveData(this.options);
    }
    async writeOptions(changeOpts) {
        settings$1.update((old) => (Object.assign(Object.assign({}, old), changeOpts(old))));
        await this.saveData(this.options);
    }
}

module.exports = CalendarPlugin;
