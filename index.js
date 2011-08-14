/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true devel: true
         forin: true latedef: false supernew: true */
/*global define: true */

!(typeof define === "undefined" ? function ($) { $(require, exports, module); } : define)(function (require, exports, module, undefined) {

"use strict";

const { Cc, Ci, Cr, Cm, components: { Constructor: CC } } = require('chrome')
const Process = CC('@mozilla.org/process/util;1', 'nsIProcess', 'init')
const File = CC('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath')
const profile = CC('@mozilla.org/file/directory_service;1',
                      'nsIProperties')().get('ProfD', Ci.nsIFile)

const { OS } = require('api-utils/runtime')
const { env } = require('./support/env/index')
const { notify } = require('addon-kit/notifications')
const { notifications } = require('./system-notifications')

const isWindows = OS === 'WINNT'
const PATH_SEPARATOR = isWindows ? ';' : ':'
const COMMAND_NAME = isWindows ? 'git.exe' : 'git'

const GIT_TREE = profile.path
profile.append('.git')
const GIT_DIR = profile.path

const GIT_INDEX = [ '--git-dir', GIT_DIR, '--work-tree', GIT_TREE ]
const IS_GIT_REPO = [ 'rev-parse', '--is-inside-work-tree' ]
const INIT = [ 'init' ]
const ADD = [ 'add', '.' ]
const COMMIT = [ 'commit', '-m', ]

const TITLE = 'Profile Versions'

const COMMAND = (function findGit() {
  let path, paths = env.PATH.split(PATH_SEPARATOR)
  while ((path = paths.shift())) {
    let file = File(path)
    file.append(COMMAND_NAME)
    if (file.exists())
      return file.path
  }
})()

function process(command) {
  return Process(File(command))
}

function spawn(command, args, callback) {
  let p = process(command)
  if (!callback) p.run(true, args, args.length)
  else {
    p.runAsync(args, args.length, {
      observe: function (subject, topic, data) {
        if (topic === 'process-finished')
          callback(null, process)
        else if (topic === 'process-failed')
          callback(new Error("Process failed"), process)
      }
    })
  }
  return p
}

function hasGit() {
  return !!COMMAND
}
exports.hasGit = hasGit

function isGitRepo() {
  return spawn(COMMAND, GIT_INDEX.concat(IS_GIT_REPO)).exitValue === 0
}
exports.isGitRepo = isGitRepo

function init(callback) {
  return spawn(COMMAND, GIT_INDEX.concat(INIT), callback)
}
exports.init = init

function add(callback) {
  return spawn(COMMAND, GIT_INDEX.concat(ADD), callback)
}
exports.add = add

function commit(message, callback) {
  return spawn(COMMAND, GIT_INDEX.concat(COMMIT.concat(message)), callback)
}
exports.commit = commit

function main() {
  if (!hasGit())
    return notify({ title: TITLE, text: 'Git installation was not found on system' })

  if (!isGitRepo()) {
    notify({ title: TITLE, text: 'Initializing profile versions (takes time)' })
    init(function(error, { exitValue }) {
      if (error || exitValue)
        return notify({ title: TITLE, text: 'Unable to initialize git repository' })
      add(function(error, { exitValue }) {
        if (error || exitValue)
          return notify({ title: TITLE, text: 'Unable to stage profile to git repository '})
        commit(Date(), function(error, { exitValue }) {
          if (error || exitValue)
            return notify({ title: TITLE, text: 'Unable to version profile'})
          notify({ title: TITLE, text: 'Profile versions initialized!'})
          main()
        })
      })
    })
  } else {
    notifications('quit-application-requested')(function() {
      if (add().exitValue === 0 && commit(Date()).exitValue === 0)
        notify({ title: TITLE, text: 'Version created'})
      else
        notify({ title: TITLE, text: 'Failed to version profile'})
      return false
    })
  }
}

main()

});
