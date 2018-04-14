require('dotenv').config()
const PORT = process.env.PORT
const MULTICAST = process.env.MULTICAST
const ID = process.env.ID
const PROCESSES = process.env.PROCESSES

const {
  app,
  BrowserWindow,
} = require('electron')
const path = require('path')
const url = require('url')

const dgram = require('dgram')
const socket = dgram.createSocket('udp4');
const ip = require('ip')
let vector = [0, 0, 0, 0, ]
let queue = []
let aks = 0

console.log(ip.address())

let win

const addToQueue = (request) => {
  queue.push(request)
  queue = queue.sort((a, b) => {
    const as = a.timestamp.reduce((ac, v) => ac + v, 0)
    const bs = b.timestamp.reduce((ac, v) => ac + v, 0)
    return as !== bs ? as > bs : a.from > b.from
  })
}

const checkForChanges = () => {
  if (aks === 0) {
    if (queue[0].from === ID) {
      // Write to file
      const free = {
        type: 'FRE',
        from: ID,
        letter: queue[0].letter, // from state
        position: queue[0].position, // from state
      }
      queue.shift()
      socket.send(JSON.stringify(free), PORT, MULTICAST)
    }
  }
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

  win.on('closed', () => {
    win = null
  })

  socket.bind(PORT, () => {
    socket.addMembership(MULTICAST, ip.address());
  });
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

const ipc = require('electron').ipcMain;

ipc.on('invokeAction', (event, data = {
  key: 'a',
  pos: 0
}) => {
  vector[ID]++
    const request = {
      type: 'REQ',
      timestamp: vector,
      from: ID,
      position: data.pos,
      letter: data.key,
    }
  addToQueue(request)
  socket.send(JSON.stringify(request), PORT, MULTICAST)
});

socket.on('message', (msg, info) => {
  if (info.address !== ip.address()) {
    const message = (new Buffer(msg)).toString()
    const msgObj = JSON.parse(message)
    console.log(msgObj)
    switch (msgObj.type) {
      case 'ACK':
        if (msgObj.from === ID) {
          aks = (aks + 1) % PROCESSES
          checkForChanges()
        }
        break
      case 'REQ':
        addToQueue(msgObj) // Assuming we are not in the CS
        const ack = {
          type: 'ACK',
          from: msgObj.from,
        }
        socket.send(JSON.stringify(ack), PORT, MULTICAST)
        break
      case 'FRE':
        // Write to file
        queue.shift()
        checkForChanges()
        break
    }
  }
})
