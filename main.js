require('dotenv').config()
const PORT = process.env.PORT
const ID = process.env.ID
const PROCESSES = process.env.PROCESSES

const {
  app,
  BrowserWindow,
  dialog
} = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs')

const net = require('net')
let server
const clients = [
  process.env.CLIENT1,
  process.env.CLIENT2,
  process.env.CLIENT3,
]
let coso = 0

const ip = require('ip')
let vector = [0, 0, 0, 0]
let queue = []
let aks = 0

console.log(ip.address())

let win

const mergeVectors = (timestamp) => {
  vector[ID]++
  vector = vector.map((v, i) => v > timestamp[i] ? v : timestamp[i])
}

const addToQueue = (request) => {
  mergeVectors(request.timestamp)
  queue.push(request)
  queue = queue.sort((a, b) => {
    const as = a.timestamp.reduce((ac, v) => ac + v, 0)
    const bs = b.timestamp.reduce((ac, v) => ac + v, 0)
    return as !== bs ? as > bs : a.from > b.from
  })
}

const unlock = () => {
  state.event.sender.send('unlock')
}

const checkForChanges = () => {
  if (aks === 0) {
    if (queue[0] && queue[0].from === ID) {
      const tmp = state.text.split('')
      tmp.splice(
        queue[0].position, queue[0].action === 'added' ? 0 : 1,
        queue[0].action === 'added' ? queue[0].letter : undefined
      )
      setState({
        text: tmp.join(''),
        from: queue[0].from,
        position: queue[0].position,
        action: queue[0].action,
      })
      const free = {
        type: 'FRE',
        from: ID,
        letter: queue[0].letter,
        position: queue[0].position,
        action: queue[0].action,
        timestamp: vector,
      }
      let answers = 0
      queue.shift()
      clients.map((ip) => {
        const client = new net.Socket()
        client.connect(PORT, ip, () => {
          client.write(JSON.stringify(free), () => {
            answers++
            if(answers === process.env.PROCESSES - 1){
              unlock()
            }
          })
        })
      })
    }
  }
}

let state = {
  text: '',
  id: ID,
  from: ID,
  fileName: `Leyendo de archivo: ${process.env.FILE}`,
  filePath: path.join(__dirname, process.env.FILE),
}

const createWindow = () => {
  win = new BrowserWindow({
    width: 800,
    height: 600,
  })

  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true,
  }))

  win.webContents.openDevTools()
  let preventClose = true

  win.on('close', (e) => {
    if (preventClose) {
      e.preventDefault()
      dialog.showMessageBox({
        type: 'question',
        buttons: ['No', 'Yes',],
        title: 'You\'re leaving the app!',
        message: 'Do you want to save your changes?'
      }, function (response) {
        preventClose = false
        win.close ()
        if (response === 1) {
          fs.writeFileSync(state.filePath,state.text, {encoding:'utf8'})
        }
      })
    }
  })

  server = net.createServer((socket) => {
    socket.on('data', (msg) => {
      const message = msg.toString()
      const msgObj = JSON.parse(message)
      const indice = coso++
      switch (msgObj.type) {
        case 'ACK':
          if (msgObj.from === ID) {
            aks = (aks + 1) % (PROCESSES - 1)
            mergeVectors(msgObj.timestamp)
            checkForChanges()
          }
          break
        case 'REQ':
          addToQueue(msgObj)
          const ack = {
            type: 'ACK',
            from: msgObj.from,
            timestamp: vector,
          }
          clients.map((ip) => {
            const client = new net.Socket()
            client.connect(PORT, ip, () => {
              client.write(JSON.stringify(ack))
            })
          })
          break
        case 'FRE':
          console.log(msgObj, queue)
          const tmp = state.text.split('')
          tmp.splice(
            msgObj.position, msgObj.action === 'added' ? 0 : 1,
            msgObj.action === 'added' ? msgObj.letter : undefined
          )
          setState({
            text: tmp.join(''),
            from: msgObj.from,
            position: msgObj.position,
            action: msgObj.action,
          })
          const actual = queue.findIndex(x => x.from === msgObj.from && x.position === msgObj.position && x.letter === msgObj.letter && x.action === msgObj.action)
          queue.splice(actual, 1)
          mergeVectors(msgObj.timestamp)
          checkForChanges()
          break
      }
      socket.destroy()
    })
  })

  server.listen(PORT)
}

const setState = (newState) => {
  for (let key in newState) {
    state[key] = newState[key]
  }
  state.event.sender.send('stateChange', state)
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (win === null) {
    createWindow()
  }
})

const ipc = require('electron').ipcMain

const sendMessages = (data) => {
  const request = {
    type: 'REQ',
    timestamp: vector,
    from: ID,
    position: data.pos,
    letter: data.key,
    action: data.action,
  }
  addToQueue(request)
  clients.map((ip) => {
    const client = new net.Socket()
    client.connect(PORT, ip, () => {
      client.write(JSON.stringify(request))
    })
  })
}

ipc.on('documentReady', (event, data) => {
  setState({
    text: String(fs.readFileSync(state.filePath)).replace(/\r?/g, ''),
    event
  })
})

ipc.on('invokeAction', (event, data) => {
  let diff = getChange(data.text, state.text, data.cursorPosition)
  sendMessages(diff)
})

getChange = (newData, oldData, charPos) => {
  let data = {}
  if (newData.length > oldData.length) {
    data.key = newData.charAt(charPos - 1)
    data.pos = charPos - 1
    data.action = 'added'
  } else {
    data.key = oldData.charAt(charPos)
    data.pos = charPos
    data.action = 'deleted'
  }

  if(data.key == '\r'){
    data.key = '\n'
  }

  return data
}
