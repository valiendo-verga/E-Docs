const {
  app,
  BrowserWindow,
} = require('electron')
const path = require('path')
const url = require('url')
const fs = require('fs')


let win

let state = {
  text: '',
  fileName: process.argv[2],
  filePath: path.join(__dirname, process.argv[2])
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
}

const setState = (newState, event) => {
  state = newState;
  event.sender.send('stateChange', state);
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

ipc.on('documentReady', function (event, data) {
  state.text = String (fs.readFileSync (state.filePath));
  event.sender.send('stateChange', state);
});

ipc.on('invokeAction', function (event, data) {
  console.log(data)
  let diff = getChange (data.text, state.text, data.cursorPosition);
  setState({ text: data.text }, event);
});

getChange = (newData, oldData, charPos) => {
  let diff = {};
  if (newData.length > oldData.length) {
    diff.char = newData.charAt (charPos - 1);
    diff.actionType = 'added';
  } else {
    diff.char = oldData.charAt (charPos);
    diff.actionType = 'deleted';
  }

  return diff;
}