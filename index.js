#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const Travis = require('travis-ci')
const Pusher = require('pusher-js')
const ora = require('ora')
const OrderedEmitter = require('ordered-emitter')
const got = require('got')
const pkg = require('./package')

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

const getLogs = job =>
  got(`https://api.travis-ci.org/jobs/${job.id}/log`, {
    headers: {
      'user-agent': `github.com/juliangruber/travis-logs@${pkg.version}`,
      accept: 'application/json; chunked=true; version=2, text/plain; version=2'
    }
  })

const streamLogs = (appKey, job) => {
  const ordered = new OrderedEmitter()

  return Promise.all([
    new Promise(resolve => {
      const finish = () => {
        spinner = ora('').start()
        channel.unbind()
        socket.unsubscribe(`job-${job.id}`)
        resolve()
      }

      spinner.text = 'Waiting for logs'
      ordered.once('log', () => {
        spinner.stop()
        spinner = null
      })
      ordered.on('log', msg => {
        process.stdout.write(msg._log || msg.content || '')
        if (msg.final) finish()
      })

      const socket = new Pusher(appKey)
      const channel = socket.subscribe(`job-${job.id}`)
      channel.bind('job:log', msg => {
        ordered.emit('log', Object.assign(msg, { order: msg.number }))
      })
    }),
    getLogs(job)
    .then(res => {
      try {
        return JSON.parse(res.body)
      } catch (err) {
        return res.body
      }
    })
    .then(body => {
      if (typeof body === 'string') {
        ordered.emit('log', { order: 0, _log: body, final: true })
      } else {
        body.log.parts.forEach(part => {
          ordered.emit('log', Object.assign(part, { order: part.number }))
        })
      }
    })
  ])
}

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
      const job = jobs.find(
        job => job.state !== 'failed' && job.state !== 'passed'
      )
      return streamLogs(appKey, job)
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
