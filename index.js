#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const Travis = require('travis-ci')
const Pusher = require('pusher-js')
const ora = require('ora')

require('blocking-stdio')();

const travis = new Travis({ version: '2.0.0' })
const dir = process.argv[2] || process.cwd()

const failure = () => {
  if (spinner) spinner.fail('Build failed!')
  else console.error('Build failed!')
  process.exit(1)
}

const passed = () => {
  if (spinner) spinner.succeed('Build passed!')
  else console.log('Build passed!')
  process.exit(0)
}

const getPusher = () => new Promise((resolve, reject) => {
  travis.config.get((err, res) => {
    if (err) return reject(err)
    resolve(res.config.pusher.key)
  })
})

const streamLogs = (appKey, job) => new Promise(resolve => {
  const socket = new Pusher(appKey)
  const channel = socket.subscribe(`job-${job.id}`)
  channel.bind('job:log', msg => {
    process.stdout.write(msg._log)
    if (msg.final) {
      channel.unbind()
      socket.unsubscribe(`job-${job.id}`)
      resolve()
    }
  })
})

const getJob = id => new Promise((resolve, reject) => {
  const cb = (err, res) => err ? reject(err) : resolve(res.job)
  travis.jobs(id).get(cb)
})

let repo, sha
let spinner = ora('Loading repo, commit, settings').start()

Promise.all([
  Promise.all([getRepo(dir), getCommit(dir)])
      .then(([_repo, _sha]) => {
        [repo, sha] = [_repo, _sha]
        spinner.text = 'Loading build'
        return getBuild({ repo, sha })
      })
      .then(build => {
        if (build.state === 'failed') failure()
        else if (build.state === 'passed') passed()
        spinner.text = 'Loading jobs'
        return build
      })
      .then(build => Promise.all(build.job_ids.map(id => getJob(id)))),
  getPusher()
])
  .then(([jobs, appKey]) => {
    const job = jobs.find(
      job => job.state !== 'failed' && job.state !== 'passed'
    )
    spinner.stop()
    spinner = null
    return [appKey, job]
  })
  .then(([appKey, job]) => streamLogs(appKey, job))
  .then(() => {
    getBuild({ repo, sha }).then(build => {
      if (build.state === 'failed') failure()
      else if (build.state === 'passed') passed()
      // else: repeat
    })
  })
