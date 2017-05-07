#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const Travis = require('travis-ci')
const ora = require('ora')
const logStream = require('travis-log-stream')
const retry = require('p-retry')

require('blocking-stdio')()

const travis = new Travis({ version: '2.0.0' })
const dir = process.argv[2] || process.cwd()

const getPusher = () => new Promise((resolve, reject) => {
  travis.config.get((err, res) => {
    if (err) return reject(err)
    resolve(res.config.pusher.key)
  })
})

const streamLogs = ({ appKey, jobId }) => new Promise((resolve, reject) => {
  spinner.text = 'Waiting for logs'
  const s = logStream({ appKey, jobId })
  s.once('data', () => {
    spinner.stop()
    spinner = null
  })
  s.on('end', () => {
    spinner = ora('').start()
    resolve()
  })
  s.on('error', err => reject(err))
  s.pipe(process.stdout, { end: false })
})

const getJob = id => new Promise((resolve, reject) => {
  const cb = (err, res) => err ? reject(err) : resolve(res.job)
  travis.jobs(id).get(cb)
})

let repo, sha
let spinner = ora('Loading repo, commit, settings').start()

Promise.all([
  getRepo(dir),
  retry(() => getCommit(dir), { retries: 5 })
])
  .then(([_repo, _sha]) => {
    [repo, sha] = [_repo, _sha]
  })
  .then(() => {
    spinner.text = 'Loading build'
    return getBuild({ repo, sha })
  })
  .then(build => {
    spinner.text = 'Loading jobs'
    return Promise.all([
      Promise.all(build.job_ids.map(id => getJob(id))),
      getPusher()
    ])
  })
  .then(([jobs, appKey]) => {
    const start = Promise.resolve(true)
    let next = start
    for (let job of jobs) {
      next = next.then(() => streamLogs({ jobId: job.id, appKey }))
    }
    next
      .then(() => {
        spinner.text = 'Loading build'
        return getBuild({ repo, sha })
      })
      .then(build => {
        if (build.state === 'passed') {
          spinner.succeed('Build passed!')
          process.exit(0)
        } else {
          spinner.fail('Build failed!')
          process.exit(1)
        }
      })
    return start
  })
  .catch(err => {
    spinner.fail(`Error: ${err.message}`)
    process.exit(1)
  })
