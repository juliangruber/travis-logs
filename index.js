#!/usr/bin/env node
'use strict'

const getCommit = require('git-current-commit').promise
const getRepo = require('gh-canonical-repository').promise
const getBuild = require('travis-build-by-commit')
const { https } = require('follow-redirects')

const dir = process.argv[2] || process.cwd()

Promise.all([getRepo(dir), getCommit(dir)])
  .then(([repo, sha]) => getBuild({ repo, sha }))
  .then(build => {
    const job = build.job_ids[build.job_ids.length - 1]
    https.get(`https://api.travis-ci.org/jobs/${job}/log`, res => {
      if (res.statusCode !== 200) throw Error(`Status: ${res.statusCode}`)
      res.pipe(process.stdout)
    })
  })
