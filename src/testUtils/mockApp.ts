// -nocheck
import type { App } from "obsidian";

/* eslint-disable */
const mockApp: App = {
  vault: {
    adapter: {
      exists: () => Promise.resolve(false),
      getName: () => "",
      stat: () => Promise.resolve(null),
      list: () => Promise.resolve(null),
      read: () => Promise.resolve(null),
      readBinary: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      writeBinary: () => Promise.resolve(),
      append: () => Promise.resolve(),
      appendBinary: () => Promise.resolve(),
      process: (_path, fn) => Promise.resolve(fn("")),
      getResourcePath: () => "",
      mkdir: () => Promise.resolve(),
      trashSystem: () => Promise.resolve(true),
      trashLocal: () => Promise.resolve(),
      rmdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      copy: () => Promise.resolve(),
    },
    configDir: ".obsidian",
    getName: () => "",
    getFileByPath: () => null,
    getFolderByPath: () => null,
    getAbstractFileByPath: () => null,
    getRoot: () => ({
      children: [],
      isRoot: () => true,
      name: "",
      parent: null,
      path: "",
      vault: null,
    }),
    create: jest.fn(),
    createFolder: () => Promise.resolve(null),
    createBinary: () => Promise.resolve(null),
    read: () => Promise.resolve(""),
    cachedRead: () => Promise.resolve("foo"),
    readBinary: () => Promise.resolve(null),
    getResourcePath: () => null,
    delete: () => Promise.resolve(),
    trash: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    modify: () => Promise.resolve(),
    modifyBinary: () => Promise.resolve(),
    append: () => Promise.resolve(),
    appendBinary: () => Promise.resolve(),
    process: (_file, fn) => Promise.resolve(fn("")),
    copy: () => Promise.resolve(null),
    getAllLoadedFiles: () => [],
    getAllFolders: () => [],
    getMarkdownFiles: () => [],
    getFiles: () => [],
    on: () => null,
    off: () => null,
    offref: () => null,
    tryTrigger: () => null,
    trigger: () => null,
  },
  workspace: null,
  metadataCache: {
    getCache: () => null,
    getFileCache: () => null,
    getFirstLinkpathDest: () => null,
    on: () => null,
    off: () => null,
    offref: () => null,
    tryTrigger: () => null,
    fileToLinktext: () => "",
    trigger: () => null,
    resolvedLinks: null,
    unresolvedLinks: null,
  },
  // @ts-ignore
  internalPlugins: {
    plugins: {
      "daily-notes": {
        instance: {
          options: {
            format: "",
            template: "",
            folder: "",
          },
        },
      },
    },
  },
};
/* eslint-enable */

export default mockApp;
