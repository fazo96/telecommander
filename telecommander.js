#!/usr/bin/env node

// Prepare deps and fs
var cfgDir = (process.env.HOME || process.env.USERPROFILE) + '/.config/telecommander/'
process.env.LOGGER_FILE = cfgDir+'log'

var os = require('os')
var fs = require('fs')
var moment = require('moment')
var blessed = require('blessed')

try { fs.makeDirSync(cfgDir,'0770') } catch (e) { }

var getLogger = require('get-log')
getLogger.PROJECT_NAME = 'telecommander'
var logger = getLogger('main')

var telegramLink = require('telegram.link')()

// Prepare blessed UI

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

// Function to create a log box
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

// Contact list window
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

// Command line prompt
var cmdline = blessed.textbox({
  inputOnFocus: true,
  bottom: 0,
  left: 'center',
  width: '100%',
  height: 3,
  border: { type: 'line' },
  style: defaultStyle
})

var statusWindow = "Status"

// mgsBox holds the chat boxes for every list entry
var msgBox = { }
msgBox[statusWindow] = mkBox()

// Add stuff to the screen
screen.append(chats);
screen.append(cmdline);
screen.append(msgBox[statusWindow]);

// Contacts holds all the contacts data
var contacts = { }
// Groups hold all the data about groups
var groups = { }
// nameToUid is used to match a name to its user id (for the contact list)
var nameToUid = { }

var state // keeps track of the last time the client was updated
var client // used to talk with telegram
var phone // our phone number
var code // our phone code
var phoneCodeHash // our phone code thingy that telegram wants
var fullName
var username
var loginResult // Store here the server answer to the login
var uid // our user id
var authKey // our authorization key to access telegram
var registered = false // keep track of wether the phone number is registered
var connected = false // keep track of wether we are good to go and logged in
var selectedWindow = statusWindow // the currently selected window

function command(cmd){
  cmdl = cmd.split(' ')
  cmdname = cmdl[0]

  if(cmdname === 'phone'){ // So the user can provide his phone numbah
    if(connected){
      return log("Silly user, you're already connected! We don't need that phone number")
    }
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

  } else if(cmdname === 'code'){ // So the user can provide his phone code
    if(connected){
      return log("Silly user, you're already connected! We don't need that phone code")
    }
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

  } else if(cmdname === 'msg'){ // Send a message
    msg(cmdl[1],cmdl[2])
  }
}
chats.addItem(msgBox[statusWindow])
screen.render();

// What happens when a different window is selected
chats.on('select',function(selected){
  log('SELECT:',selected.content)
  msgBox[selectedWindow].hide()
  selectedWindow = selected.content;
  var newb = getMsgBox(selectedWindow)
  newb.show() 
})

// Get msgBox for given chat, create if not exists
function getMsgBox(chat){
  // Automatically convert ids to names
  if(contacts[chat]) chat = contacts[chat].user.id
  if(groups[chat]); // To be implemented
  if(!msgBox[chat]){
    log('Generating window: "'+chat+'"')
    msgBox[chat] = mkBox()
    screen.append(msgBox[chat])
    var uid = nameToUid[chat]
    if(uid != undefined){
      // Is a real user: download messages and stuff
      getMessages(uid,msgBox[chat]) 
    }
  }
  return msgBox[chat]
}

// What happens when the user submits a command in the prompt
cmdline.on('submit',function(value){
  msgBox[statusWindow].add('< '+value)
  if(nameToUid[selectedWindow] == undefined){
    command(value)
  } else {
    // Send Message
    msg(nameToUid[selectedWindow],value)
  }
  cmdline.clearValue()
  cmdline.focus()
})

cmdline.focus() // make sure prompt is focused

// Catch ctrl-c or escape event and close program  
cmdline.key(['escape','C-c'], function(ch,key){
  if(connected || client != undefined){
    log('Closing communications and shutting down...')
    client.end(function(){
      process.exit(0)
    })
  } else process.exit(0);
});

// Send a message
function msg(uid,str){
  if(!connected){
    return log('Error: not ready to send messages')
  }
  var peer = new telegramLink.type.InputPeerContact({ props: { user_id: ''+uid } })
  var randid = parseInt(Math.random() * 1000000000)
  client.messages.sendMessage(peer,str,randid,function(sent){
    log('Send message:','"'+str+'"','to:',selectedWindow+':',sent.toPrintable())
  })
}

// Write something in the Status box
function log(){
  args = Array.prototype.slice.call(arguments)
  var msg = args.join(' ')
  msgBox[statusWindow].add(msg)
  logger.info(msg)
}

// Prepare data to feed to telegramLink
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
      whenReady()
    }
  })

  client.once('dataCenter',function(dcs){
    log('Datacenters:',dcs.toPrintable())
  })
}

// Executed when connected and logged in
function whenReady(){
  log('READY!')
  connected = true
  downloadData()
}

// Downloads stuff
function downloadData(){
  log('Downloading data...')
  
  client.contacts.getContacts('',function(cont){
    chats.clearItems()
    chats.add(statusWindow)
    cont.users.list.forEach(function(user,index){
      if(!contacts[user.id]) contacts[user.id] = {}
      contacts[user.id].user = user
      var name = getName(user.id)
      nameToUid[name] = user.id
      chats.addItem(name)
      log('Added user:',user.id,'-',name)
    })
  })

  client.messages.getDialogs(0,0,10,function(dialogs){
    dialogs.dialogs.list.forEach(function(item){
      if(item.peer.chat_id){ // is a group
        groups[item.peer.chat_id] = item
        log('Added group:',item.peer.chat_id) 
      }
    })
  })

  client.updates.getState(function(astate){
    log('ADDING LISTENER FOR UPDATES')
    client.registerOnUpdates(onUpdate)
    log('Started receiving updates\nGot State:',astate.toPrintable())
  })
}

// Called when the server sends an update
function onUpdate(upd){
  return
  log('Got Update:',upd.toPrintable())
  // Process update
  if(update.message){
    // It's a chat message
    log('Writing chat message to ',update.from_id)
    //appendMsg(update,getName(update.from_id))
  }
}

function getName(uid){
  var user = contacts[uid]
  if(!contacts[uid])
    return
  else
    user = contacts[uid].user
  return user.first_name + ' ' + user.last_name + (user.username?' ('+user.username+')':'')
}

// Get message history with given id in the given box
function getMessages(uid,box){
  if(!connected){
    return log('Uh cant get messages cuz not connected.....')
  }
  box.add('Downloading message history for '+getName(uid))
  var peer = new telegramLink.type.InputPeerContact({ props: { user_id: uid } })
  client.messages.getHistory(peer,0,-1,20,function(res){
    //log(res.toPrintable())
    var rbox = getMsgBox(getName(peer.user_id))
    log('Got history for: '+getName(uid))
    res.messages.list.sort(function(msg1,msg2){
      return msg1.date - msg2.date
    })
    if(res.messages.list.length === 0)
      return rbox.add('No messages.')
    rbox.add('Printing...')
    for(i in res.messages.list){
      appendMsg(res.messages.list[i],rbox)
    }
    /*
    res.messages.list.forEach(function(msg){
      if(!msg.message) return;
      appendMsg(msg,rbox)
    })
    */
  })
}

// Writes given telegram.link "message" object to given boxId
function appendMsg(msg,toBoxId){
  var from = msg.from_id
  var date = moment.unix(msg.date).fromNow()
  name = getName(from)
  toBoxId.add(date+' | '+(name || from)+' > '+msg.message)
}

// Try to load key from disk
var keyPath = cfgDir+'key'
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
