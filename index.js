#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const Travis = require('travis-ci')
const ora = require('ora')
const logStream = require('travis-log-stream')

require('blocking-stdio')()

const travis = new Travis({ version: '2.0.0' })
const dir = process.argv[2] || process.cwd()

const failure = () => {
  spinner.fail('Build failed!')
  process.exit(1)
}

const passed = () => {
  spinner.succeed('Build passed!')
  process.exit(0)
}

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

const next = () => {
  spinner.text = 'Loading build'
  return getBuild({ repo, sha })
    .then(build => {
      if (build.state === 'failed') failure()
      else if (build.state === 'passed') passed()
      spinner.text = 'Loading jobs'
      return build
    })
    .then(build =>
      Promise.all([
        getPusher(),
        Promise.all(build.job_ids.map(id => getJob(id)))
      ]))
    .then(([appKey, jobs]) => {
      const jobId = jobs.find(
        job => job.state !== 'failed' && job.state !== 'passed'
      ).id
      return streamLogs({ appKey, jobId })
    })
    .then(next)
}

Promise.all([getRepo(dir), getCommit(dir)])
  .then(([_repo, _sha]) => {
    [repo, sha] = [_repo, _sha]
    return next()
  })
  .catch(err => {
    spinner.fail(`Error: ${err.message}`)
    process.exit(1)
  })
