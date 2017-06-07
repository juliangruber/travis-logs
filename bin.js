#!/usr/bin/env node
'use strict'

require('blocking-stdio')()

const logs = require('.')
const ora = require('ora')

const dir = process.argv[2] || process.cwd()

let spinner = ora('Loading repo, commit, settings').start()

logs(dir)
  .on('repo', () => {
    spinner.text = 'Loading build'
  })
  .on('build', () => {
    spinner.text = 'Loading jobs'
  })
  .on('job', stream => {
    spinner.text = 'Waiting for logs'
    stream.once('data', () => {
      spinner.stop()
      spinner = null
    })
    stream.on('end', () => {
      spinner = ora('').start()
    })
    stream.pipe(process.stdout, { end: false })
  })
  .on('pass', () => {
    spinner.succeed('Build passed!')
    process.exit(0)
  })
  .on('fail', () => {
    spinner.fail('Build failed!')
    process.exit(1)
  })
  .on('error', err => {
    spinner.fail(`Error: ${err.message}`)
    process.exit(1)
  })
