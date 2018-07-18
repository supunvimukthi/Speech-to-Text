var choo = require('choo')
var html = require('choo/html')
var app = choo()
var SpeechToText = require('../')
var path = require('path')
var log = require('choo-log')


console.log("process.env.GOOGLE_SPEECH_API_CONFIG : ", process.env.GOOGLE_SPEECH_API_CONFIG);

var s2t = new SpeechToText({
  projectId: 'getusermedia-to-text',
  keyFilename: process.env.GOOGLE_SPEECH_API_CONFIG
})

window.s2t = s2t

app.use(log())
app.use(store)

app.route('/', view)
app.mount('#app')

function store (state, bus) {
  state.msgs = []
  state.listening = false

  s2t.on('error', logError)
  function logError (error) {
    state.msgs.push(error.message)
  }
  s2t.on('status', log)
  function log (data) {
    state.msgs.push(data)
    bus.emit('render')
  }

  s2t.on('data', apiLog)
  function apiLog (data) {
    if(data.results[0] !=null){
      state.msgs.push(JSON.stringify(data.results[0].transcript))
    }else{
      state.msgs.push(JSON.stringify(data))
    }

    
    bus.emit('render')
  }

  s2t.on('listening', function (status) {
    state.listening = status
    bus.emit('render')
  })

  bus.on('clear', clear)
  function clear () {
    state.msgs = []
    bus.emit('render')
  }

  bus.on('listen', listen)
  function listen () {
    s2t.start()
  }

  bus.on('stop', stop)
  function stop () {
    s2t.stop()
  }
}

function view (state, emit) {
  return html`
    <main>
      <div>
        ${state.listening
          ? html`<button onclick=${() => emit('stop')}>stop conversion</button>`
          : html`<button onclick=${() => emit('listen')}>start conversion</button>`}
      </div>
      Volume: <input type=range id=volume min=0 max=1  step=0.01><br><br>
      <div>Output text : </div>
      <div>
        ${state.msgs.map(msg => html`
          <div>${msg}</div>
        `)}
      </div>
    </main>
  `
}
