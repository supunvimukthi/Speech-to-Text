var EventEmitter = require('events').EventEmitter
var getUserMedia = require('getusermedia')
var Speech = require('@google-cloud/speech')
var audio = require('audio-stream')
var pcm = require('pcm-stream')
var assert = require('assert')
var pumpify = require('pumpify')
var writer = require('flush-write-stream')
var pump = require('pump')
var speaker = require('win-audio').speaker
var mic = require('win-audio').mic
var hark = require('hark')
var Recorder = require('recorderjs');
var fs = require('fs');
var recorder;

module.exports = GetUserMediaToText

function GetUserMediaToText(opts) {
  if (!(this instanceof GetUserMediaToText)) return new GetUserMediaToText()
  if (!opts) opts = {}
  // assert.ok(opts.projectId, 'GetUserMediaToText: Missing projectId in options')
  assert.ok(opts.keyFilename, 'GetUserMediaToText: Missing keyFilename path in options')
  this._opts = Object.assign({
    projectId: 'getusermedia-to-text',
    request: {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 44100,
        languageCode: 'en-US'
      },
      singleUtterance: false,
      interimResults: false,
      verbose: true
    }
  }, opts)

  this.speech = Speech({
    projectId: this._opts.projectId,
    keyFilename: this._opts.keyFilename
  })
  this.mediaStream = null
  this.audioStream = null
  this.sinkStream = null
  this.pipeline = null
  this.listening = false
  this.waiting = false

  var self = this

  getUserMedia({ video: false, audio: true }, function (err, ms) {
    if (err) throw err
    self.mediaStream = ms
    var options = {};
    var speechEvents = hark(ms, options);
    //new audio context for the audio stream
    var ac = new AudioContext();
    var source = ac.createMediaStreamSource(ms);
    
    var dest = ac.createMediaStreamDestination();
    recorder = new Recorder(source,{recordAsMP3:true})
    // Create a recorder object

    source.connect(dest);
    //new Audio(URL.createObjectURL(dest.stream)).play();
    //hark to check whether user is speaking
    speechEvents.on('speaking', function () {
      console.log('speaking');
    });

    speechEvents.on('stopped_speaking', function () {
      console.log('stopped_speaking');
    });
    
    //set the master volume of mic and speakr with the slider change
    document.getElementById('volume').onchange = function () {
      // this.value---> Any number between 0 and 1.
      speaker.set(this.value * 100);
      mic.set(this.value * 100);
    };

    speaker.polling(200);

    //change of master volume
    speaker.events.on('change', (volume) => {
      console.log("old %d%% -> new %d%%", volume.old, volume.new);
      document.getElementById('volume').value = volume.new / 100
    });

    speaker.events.on('toggle', (status) => {
      console.log("muted: %s -> %s", status.old, status.new);
      document.getElementById('volume').value = status.new
    });

    self.emit('mediaStream', ms)
  })

  EventEmitter.call(this)
}

GetUserMediaToText.prototype = Object.create(EventEmitter.prototype)

GetUserMediaToText.prototype.start = function () {
  var self = this
  if (this.listening) return this.emit('status', 'Already Listening')

  if (!this.mediaStream) {
    if (this.waiting) return this.emit('status', 'Waiting for userMedia')
    this.waiting = true
    return this.once('mediaStream', function () {
      self.waiting = false
      self.start()
    })
  }

  if (!this.sinkStream) {
    var recognizeStream = this.speech.createRecognizeStream(this._opts.request)
    var emitter = writer.obj(function (data, enc, cb) {
      self.emit('data', data)
      cb()
    })
    this.sinkStream = pumpify(pcm(), recognizeStream, emitter)
  }

  if (!this.audioStream) {
    this.audioStream = audio(this.mediaStream, {
      channels: 1,
      volume: 0.8
    })
  }
  this.listening = true
  this.emit('listening', true)
  this.emit('status', 'Started listening')
  recorder.record();  //starting recording with the click of start button
  this.pipeline = pump(this.audioStream, this.sinkStream, function (err) {
    if (err) self.emit('error', err)
    self.clearPipeline()
  })
}

GetUserMediaToText.prototype.clearPipeline = function () {
  this.listening = false
  this.emit('listening', false)
  this.audioStream = null
  this.sinkStream = null
  this.pipeline = null
  // this.mediaStream.getAudioTracks().forEach(function (track) {
  //  track.stop()
  // })
  recorder.stop(); //stop recording with the click of stop button
  recorder.exportMP3(function (mp3Blob) { // Export the recording as a Blob
    //console.log("Here is your blob: " + URL.createObjectURL(mp3Blob));
    var reader = new FileReader()
    reader.onload = function () {
      var buffer = new Buffer(reader.result)
      fs.writeFile('test.mp3', buffer, {}, (err, res) => {
        if (err) {
          console.error(err)
          return
        }
        console.log('audio saved')
      })
    }
    reader.readAsArrayBuffer(mp3Blob)
    //new Audio(URL.createObjectURL(mp3Blob)).play(); //playing the audio stream just saved

  });
  recorder.exportWAV(function (mp3Blob) { // Export the recording as a Blob
    //console.log("Here is your blob: " + URL.createObjectURL(mp3Blob));
    var reader = new FileReader()
    reader.onload = function () {
      var buffer = new Buffer(reader.result)
      fs.writeFile('test1.wav', buffer, {}, (err, res) => {
        if (err) {
          console.error(err)
          return
        }
        console.log('audio-wav saved')
      })
    }
    reader.readAsArrayBuffer(mp3Blob)
    new Audio(URL.createObjectURL(mp3Blob)).play(); //playing the audio stream just saved

  });
  this.emit('status', 'Stopped listening')
}

GetUserMediaToText.prototype.stop = function () {
  if (this.listening) this.audioStream.destroy()
  else this.emit('status', 'Already Stopped')
}
