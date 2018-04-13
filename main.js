const {
  app,
  BrowserWindow,
} = require('electron')
const path = require('path')
const url = require('url')

const dgram = require('dgram')
const socket = dgram.createSocket('udp4');
const ip = require('ip')
const PORT = 8080
const MULTICAST = '230.185.192.108'

console.log(ip.address())

let win

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

ipc.on('invokeAction', function (event, data) {
  console.log(data)
  socket.send(data, PORT, MULTICAST)
  event.sender.send('actionReply', 'Hola');
});

socket.on('message', (msg, info) => {
  console.log(msg)
  console.log(info)
})
