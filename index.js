'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const Travis = require('travis-ci')
const logStream = require('travis-log-stream')
const retry = require('p-retry')
const EventEmitter = require('events')

const travis = new Travis({ version: '2.0.0' })

module.exports = dir => {
  const events = new EventEmitter()

  let repo, sha

  Promise.all([getRepo(dir), retry(() => getCommit(dir), { retries: 5 })])
    .then(([_repo, _sha]) => {
      [repo, sha] = [_repo, _sha]
      events.emit('repo')
    })
    .then(() => getBuild({ repo, sha }))
    .then(build => {
      events.emit('build')
      return Promise.all([
        Promise.all(build.job_ids.map(id => getJob(id))),
        getPusher()
      ])
    })
    .then(([jobs, appKey]) => {
      const start = Promise.resolve(true)
      let next = start
      for (let job of jobs) {
        next = next.then(
          () => new Promise((resolve, reject) => {
            const s = logStream({ appKey, jobId: job.id })
            s.on('end', resolve)
            s.on('error', err => reject(err))
            events.emit('job', s)
          })
        )
      }
      next
        .then(() => {
          return getBuild({ repo, sha })
        })
        .then(build => {
          if (build.state === 'passed') {
            events.emit('pass')
          } else {
            events.emit('fail')
          }
        })
      return start
    })
    .catch(err => {
      events.emit('error', err)
    })

  return events
}

const getPusher = () => new Promise((resolve, reject) => {
  travis.config.get((err, res) => {
    if (err) return reject(err)
    resolve(res.config.pusher.key)
  })
})

const getJob = id => new Promise((resolve, reject) => {
  const cb = (err, res) => err ? reject(err) : resolve(res.job)
  travis.jobs(id).get(cb)
})
