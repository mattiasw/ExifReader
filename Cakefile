{exec} = require 'child_process'

task 'compile', 'Compile all .coffee files to .js files', ->
  console.log 'Compiling...'
  exec 'coffee --compile --output js/ src/', (err, stdout, stderr) ->
    throw err if err
    console.log stdout + stderr

task 'test', 'Test library', ->
  console.log 'Testing...'
  exec 'jasmine-node --coffee spec/', (err, stdout, stderr) ->
    throw err if err
    console.log stdout + stderr

task 'build', 'Test and compile', ->
  invoke 'test'
  invoke 'compile'
