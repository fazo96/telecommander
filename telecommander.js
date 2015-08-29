#!/usr/bin/env node

var cfgDir = (process.env.HOME || process.env.USERPROFILE) + '/.config/telecommander/'
process.env.LOGGER_FILE = cfgDir+'log'

var os = require('os')
var fs = require('fs')
var blessed = require('blessed')

try { fs.makeDirSync(cfgDir,'0770') } catch (e) { }

var getLogger = require('get-log')
getLogger.PROJECT_NAME = 'telecommander'
var logger = getLogger('main')

var telegramLink = require('telegram.link')()

var screen = blessed.screen({
  smartCSR: true,
  dockBorders: true
})
screen.title = "Telecommander"

var defaultStyle = {
  fg: 'white',
  border: { fg: 'gray' },
  scrollbar: {
    bg: 'blue',
    fg: 'red'
  }
}

function mkBox(){
  return blessed.log({
    right: 0,
    width: '80%',
    height: screen.height-3,
    border: { type: 'line' },
    scrollable: true,
    style: defaultStyle
  })
}

var chats = blessed.list({
  left: 0,
  top:0,
  height: screen.height-3,
  width: '20%',
  border: { type: 'line' },
  mouse: true,
  style: defaultStyle,
})
chats.style.selected = { bg: 'blue' }

var cmdline = blessed.textbox({
  inputOnFocus: true,
  bottom: 0,
  left: 'center',
  width: '100%',
  height: 3,
  border: { type: 'line' },
  style: defaultStyle
})

var msgBox = { "Status": mkBox() }

screen.append(chats);
screen.append(cmdline);
screen.append(msgBox["Status"]);

var contacts = { }

var client,phone,code,phoneCodeHash,fullName,username,loginResult,uid,authKey
var registered = false
var selectedUser = "Status"

function command(cmd){
  cmdl = cmd.split(' ')
  cmdname = cmdl[0]

  if(cmdname === 'phone'){
    phone = cmd.split(' ')[1]
    client.auth.sendCode(phone,5,'en',function(result){
      log('Errors:',result.error_code,result.error_message)
      if(result.error_code) return  
      log('Res:',JSON.stringify(result))
      registered = result.phone_registered
      phoneCodeHash = result.phone_code_hash
      if(!registered){
        log("Your number is not registered. The client will register your account with the Telegram service")
        log('Ready for phone code, use command: "code <code> <name> <lastname>" to register')
      } else {
        log("Your number is already registered with telegram. The client will log in.")
        log('Ready for phone code, use command: "code <code>" to login')
      }
    })

  } else if(cmdname === 'code'){
    code = cmdl[1]
    name = cmdl[2]
    lastname = cmdl[3]
    if(((!name || !lastname) && !registered) || !code)
      return log('insufficient arguments:',cmd)
    cb = function(result){
      loginResult = result
      log('Result:',JSON.stringify(result))
      whenReady()
    }
    // Log in finally
    if(registered) client.auth.signIn(phone,phoneCodeHash,code,cb)
    else client.auth.signUp(phone,phoneCodeHash,code,name,lastname,cb)

  } else if(cmdname === 'init'){
    whenReady()
  } else if(cmdname === 'msg'){
    var peer = new telegramLink.type.InputPeerContact({ props: { user_id: selectedUser} })
    var randid = parseInt(Math.random() * 1000000000)
    client.messages.sendMessage(peer,cmdl[1],randid,function(sent){
      log('Send message:',cmdl[1],'to:',selectedUser+':',sent.toPrintable())
    })
  }
}
chats.addItem('Status')
chats.on('select',function(selected){
  log('SELECT:',selected.content)
  msgBox[selectedUser].hide()
  selectedUser = selected.content;
  //if(!isNaN(selectedUser)){ // Actual user, not utility window
  if(!msgBox[selectedUser]){
    msgBox[selectedUser] = mkBox()
    screen.append(msgBox[selectedUser])
  }
  msgBox[selectedUser].show() 
})

cmdline.on('submit',function(value){
  msgBox[selectedUser].add('[ECHO] '+value)
  if(selectedUser == "Status"){
    command(value)
  } else {
    // Send Message
    var peer = new telegramLink.type.InputPeerContact({ props: { user_id: selectedUser} })
    var randid = parseInt(Math.random() * 1000000000)
    client.messages.sendMessage(peer,value,randid,function(sent){
      log('Send message:',value,'to:',selectedUser+':',sent.toPrintable())
      msgBox[selectedUser].add('You: '+value)
    })
  }
  cmdline.clearValue()
  cmdline.focus()
})
cmdline.focus()
cmdline.key(['escape','C-c'], function(ch,key){
  if(client){
    log('Closing communications and shutting down...')
    client.end(function(){
      process.exit(0)
    })
  } else process.exit(0);
});
//cmdline.focus()
screen.render();

function log(){
  args = Array.prototype.slice.call(arguments)
  msg = args.join(' ')
  msgBox["Status"].add(msg)
  logger.info(msg)
}

var app = {
  id: '42419',
  hash: '90a3c2cdbf9b391d9ed72c0639dc0786',
  version: require('./package.json').version,
  lang: 'en',
  deviceModel: os.type(),
  systemVersion: os.platform()+'/'+os.release()
}

// Connects to telegram
function connect(){
  client = telegramLink.createClient(app, telegramLink.PROD_PRIMARY_DC, function(){
    if(!app.authKey){
      log('Creating authkey...')
      client.createAuthKey(function(auth){
        authKey = auth.key.encrypt('password') // I know sorry, but I'm testing. Will add security later, I promise
        // Writes the new encrypted key to disk 
        fs.writeFile(keyPath,authKey,function(err){
          if(err)
            log('Could not write key to disk:',err)
          else
            log('Done writing key to disk')
        })
        log('Created key, writing it to disk')
        log('ready for phone number, use command: phone <number>')
      })
    } else {
      log('Authkey loaded from disk. Should be ready to go.')
      log('Authkey:',app.authKey) 
      whenReady()
    }
  })

  client.once('dataCenter',function(dcs){
    log('Datacenters:',dcs.toPrintable())
  })
}

// Download Contacts, ecc
function whenReady(){
  log('READY!')
  downloadData()
}

function downloadData(){
  log('Downloading data...')
  client.contacts.getContacts('',function(cont){
    //log('\nContacts:\n',JSON.stringify(cont)+'\n')
    chats.clearItems()
    chats.add("Status")
    cont.users.list.forEach(function(user,index){
      contacts[user.id] = user
      chats.addItem(''+user.id)
      log('Added user: '+user.id)
    })
    fs.writeFile(cfgDir+'contacts.json',JSON.stringify(cont.users.list[0]))
  })
  client.messages.getDialogs(0,-1,10,function(dialogs){
    //log('\nDialogs:\n',JSON.stringify(dialogs)+'\n')
    fs.writeFile(cfgDir+'dialogs.json',JSON.stringify(dialogs))
  })
}

var keyPath = cfgDir+'key'
// Try loading key
log('Checking disk for key...')
fs.exists(keyPath,function(exists){
  if(exists){
    log('Key found')
    fs.readFile(keyPath,function(err,content){
      if(err)
        log('Error while reading key:',err)
      else {
        authKey = telegramLink.retrieveAuthKey(content,'password') // yeah sorry just testing
        app.authKey = authKey  
        log('Key loaded')
      }
      connect()
    })
  } else {
    log('Key not found')
    connect()
  }
})
