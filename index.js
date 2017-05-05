#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const Travis = require('travis-ci')
const Pusher = require('pusher-js')

require('blocking-stdio')();

const travis = new Travis({ version: '2.0.0' })
const dir = process.argv[2] || process.cwd()

const failure = () => {
  console.error('Build failed!')
  process.exit(1)
}

const passed = () => {
  console.log('Build passed!')
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

let repo, sha

Promise.all([
  Promise.all([getRepo(dir), getCommit(dir)])
      .then(([_repo, _sha]) => {
        [repo, sha] = [_repo, _sha]
        return getBuild({ repo, sha })
      })
      .then(build => {
        if (build.state === 'failed') failure()
        else if (build.state === 'passed') passed()
        return build
      })
      .then(build => Promise.all(
        build.job_ids.map(
          id => new Promise((resolve, reject) => {
            const cb = (err, res) => err ? reject(err) : resolve(res.job)
            travis.jobs(id).get(cb)
          })
        )
      )),
  getPusher()
])
  .then(([jobs, appKey]) => {
    const job = jobs.find(
      job => job.state !== 'failed' && job.state !== 'passed'
    )
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
