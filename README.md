
# travis-logs [![Build Status](https://travis-ci.org/juliangruber/travis-logs.svg?branch=master)](https://travis-ci.org/juliangruber/travis-logs)

Stream all available travis logs of the current repository's current commit to the terminal, until all jobs are finished!

![screenshot](screenshots/1.png)

![screenshot](screenshots/2.png)

## Usage

```bash
$ cd ~/dev/level/leveldown
$ travis-logs

$ # or

$ travis-logs ~/dev/level/leveldown
```

## Installation

```bash
$ npm install -g travis-logs
```

## JS API

```js
const logs = require('travis-logs')

logs('.')
  .on('job', stream => {
    stream.pipe(process.stdout, { end: false })
  })
  .on('pass', () => {
    process.exit(0)
  })
  .on('fail', () => {
    process.exit(1)
  })
```

For more events, check out [bin.js](https://github.com/juliangruber/travis-logs/blob/master/bin.js).

## Related projects

- __[travis-watch](https://github.com/juliangruber/travis-watch)__ &mdash; Stream live Travis test results of the current commit to your terminal!
- __[appveyor-watch](https://github.com/juliangruber/appveyor-watch)__ &mdash; Stream live AppVeyor test results of the current commit to your terminal!
- __[ci-watch](https://github.com/juliangruber/ci-watch)__ &mdash; Travis-Watch and AppVeyor-Watch combined!
- __[travis-log-stream](https://github.com/juliangruber/travis-log-stream)__ &mdash; Read streaming travis logs, no matter if live or historic.

## License

MIT


