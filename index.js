#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const { https } = require('follow-redirects')
const Travis = require('travis-ci')

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

Promise.all([getRepo(dir), getCommit(dir)])
  .then(([repo, sha]) => getBuild({ repo, sha }))
  .then(build => {
    if (build.state === 'failed') failure()
    else if (build.state === 'passed') passed()
    return build
  })
  .then(build => Promise.all(build.job_ids.map(id => new Promise((resolve, reject) => {
     const cb = (err, res) => err ? reject(err) : resolve(res.job)
     travis.jobs(id).get(cb)
  }))))
  .then(jobs => {
    const job = jobs.find(job => job.state !== 'failed' && job.state !== 'passed')
    https.get({
      host: 'api.travis-ci.org',
      path: `/jobs/${job.id}/log`,
      headers: {
        'Accept': 'text/plain chunked=true'
      }
    }, res => {
      if (res.statusCode !== 200) throw Error(`Status: ${res.statusCode}`)
      res.pipe(process.stdout)
    })
  })
