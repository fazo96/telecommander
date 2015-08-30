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
  var box = blessed.log({
    right: 0,
    width: '80%',
    height: screen.height-3,
    border: { type: 'line' },
    scrollable: true,
    draggable: true,
    style: defaultStyle
  })
  box.hide()
  return box
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

var state = { } // keeps track of the telegram update state
var client // used to talk with telegram
var user = { } // holds data about current user
var authKey // our authorization key to access telegram
var connected = false // keep track of wether we are good to go and logged in
var selectedWindow = statusWindow // the currently selected window

function command(cmd){
  cmdl = cmd.split(' ')
  cmdname = cmdl[0]

  if(cmdname === 'phone'){ // So the user can provide his phone numbah
    if(connected){
      return log("Silly user, you're already connected! We don't need that phone number")
    }
    user.phone = cmd.split(' ')[1]
    var mindate = moment()
    client.auth.sendCode(user.phone,5,'en',function(result){
      if(result.err_code){
        return log('Errors:',result.error_code,result.error_message)
      }
      //log('Res:',JSON.stringify(result))
      user.registered = result.phone_registered
      user.phoneCodeHash = result.phone_code_hash
      function gmd(){
        var m = moment()
        m = m.subtract(m.diff(mindate))
        return 'Please use a telegram code not older than '+m.fromNow(true)
      }
      if(!user.registered){
        log("Your number is not registered. The client will register your account with the Telegram service")
        log(gmd())
        log('Ready for phone code, use command: "code <code> <name> <lastname>" to register')
      } else {
        log("Your number is already registered with telegram. The client will log in.")
        log(gmd())
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
    if(((!name || !lastname) && !user.registered) || !code)
      return log('insufficient arguments:',cmd)
    cb = function(result){
      user.id = ''+result.user.id
      user.phone = result.user.phone
      user.phoneCodeHash = result.phone_code_hash
      user.username = result.user.username
      user.first_name = result.user.first_name
      user.last_name = result.user.last_name
      // Done, write user data and key to disk
      log('Writing key to disk...')
      fs.writeFile(cfgDir+'key',authKey,function(err){
        if(err)
          log('Could not write key to disk:',err)
        else
          log('key saved to disk')
      })
      log('Writing user info to disk...')
      fs.writeFile(cfgDir+'user_data.json',JSON.stringify(user),function(err){
        if(err)
          log("ERROR: couldn't write user_data.json:",err)
        else
          log('user_data.json saved to disk with data:',JSON.stringify(user))
      })
      whenReady()
    }
    // Log in finally
    if(user.registered) client.auth.signIn(user.phone,user.phoneCodeHash,code,cb)
    else client.auth.signUp(user.phone,user.phoneCodeHash,code,name,lastname,cb)

  } else if(cmdname === 'msg'){ // Send a message
    sendMsg(cmdl[1],cmdl[2])
  }
}
chats.addItem(msgBox[statusWindow])
switchToBox(statusWindow)
screen.render();

// What happens when a different window is selected
chats.on('select',function(selected){
  log('SELECT:',selected.content)
  switchToBox(selected.content)
})

function switchToBox(boxname){
  msgBox[selectedWindow].hide()
  selectedWindow = boxname;
  var newb = getMsgBox(selectedWindow)
  newb.show()
}

// Get msgBox for given chat, create if not exists
function getMsgBox(chat,switchto){
  // Automatically convert ids to names
  //if(contacts[chat]) chat = contacts[chat].user.id
  //if(groups[chat]); // To be implemented
  if(chat === undefined){
    log('ERROR: asked for box for "undefined"!!')
    return msgBox[statusWindow]
  }
  if(!msgBox[chat]){
    log('Generating window: "'+chat+'"')
    msgBox[chat] = mkBox()
    screen.append(msgBox[chat])
    var uid = nameToUid[chat]
    if(uid != undefined){
      // Is a real user: download messages and stuff
      getMessages(uid,msgBox[chat])
    }
  } else log('Getting window','"'+chat+'"')
  if(switchto === true){
    switchToBox(chat)
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
    sendMsg(nameToUid[selectedWindow],value)
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
function sendMsg(uid,str){
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
        log('Created key')
        // Writes the new encrypted key to disk
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
    cont.users.list.forEach(function(u,index){
      if(!contacts[u.id]) contacts[u.id] = {}
      contacts[u.id].user = u
      var name = getName(u.id)
      nameToUid[name] = u.id
      chats.addItem(name)
      //log('Added user:',u.id,'-',name)
    })
  })

  client.messages.getDialogs(0,0,10,function(dialogs){
    dialogs.dialogs.list.forEach(function(item){
      if(item.peer.chat_id){ // is a group
        groups[item.peer.chat_id] = item
        //log('Added group:',item.peer.chat_id)
      }
    })
  })

  client.updates.getState(function(astate){
    updateState(astate)
    log(state.unreadCount,'unread messages')
    log('Started receiving updates')
    // Can't use registerOnUpdates because it's apparently broken
    //client.registerOnUpdates(onUpdate)
    setTimeout(downloadUpdates,1000)
  })
}

// Updates the current state
function updateState(newstate){
  state.pts = newstate.pts
  state.qts = newstate.qts
  state.date = newstate.date
  state.sqp = newstate.seq
  state.unreadCount = newstate.unread_count
}

// process an update
function onUpdate(upd){
  log('Got Update:',upd.toPrintable())
  // Process update
  if(update.message){
    // It's a chat message
    log('Writing chat message to ',update.from_id)
    //appendMsg(update,getName(update.from_id))
  }
}

function downloadUpdates(){
  client.updates.getDifference(state.pts,state.date,state.qts,function(res){
    log('Got Diff: ',res.toPrintable())
    if(res.state){
      updateState(res.state)
    }
    if(res.new_messages){
      res.new_messages.list.forEach(function(msg){
        if(!msg.message) return log('Empty message!',msg)
        //log('Scheduling message: '+msg.message)
        appendMsg(msg,undefined,false,true)
      })
    }
    setTimeout(downloadUpdates,1000)
  })
}

function getName(uid){
  var u
  if(!contacts[uid])
    if(groups[uid])
      return uid
    else{
      log('Failed to find name for:',uid)
      return undefined
    }
  else u = contacts[uid].user
  return u.first_name + ' ' + u.last_name + (u.username?' ('+u.username+')':'')
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
    log('Got history for: '+getName(peer.user_id))
    res.messages.list.sort(function(msg1,msg2){
      return msg1.date - msg2.date
    })
    if(res.messages.list.length === 0)
      return appendToUserBox('No messages.',res)
    res.messages.list.forEach(function(msg){
      if(!msg.message) return log('Empty message!',msg)
      //log('Scheduling message: '+msg.message)
      appendMsg(msg)
    })
  })
}

function appendToUserBox(msg,context){
  var goesto
  if(context.messages.list.length > 0){
    if(context.messages.list[0].to_id.chat_id){
      // Group message
      log('Chose',getName(context.messages.list[0].to_id.chat_id))
      goesto = getMsgBox(getName(context.messages.list[0].to_id.chat_id))
    }
  }
  if(goesto === undefined){
    if(context.users.list[0].user_id == user.id){
      goesto = getMsgBox(getName(context.users.list[1].id))
    } else{
      goesto = getMsgBox(getName(context.users.list[0].id))
    }
  }
  appendMsg(msg,goesto,true)
}

// Writes given telegram.link "message" object to given boxId
function appendMsg(msg,toBoxId,bare,smartmode){
  var box,param
  if(toBoxId != undefined){
    box = toBoxId
  } else {
    if(msg.from_id === msg.to_id.user_id || msg.from_id != user.id){
      param = getName(msg.from_id)
    } else if(msg.to_id != user.id) {
      // don't forget dat .user_id! don't need it in from_id...
      param = getName(msg.to_id.user_id)
    } else {
      // Wtf ? maybe a group
      return log('Unknown message: from',msg.from_id,'to',msg.to_id)
    }
    if(smartmode && !bare){
      // Smart mode doesn't append the message to the box if it doesn't exist
      // because when created, the box will download message history
      if(msgBox[param] === undefined) return;
    }
    box = getMsgBox(param)
  }
  if(bare)
    box.add(msg)
  else {
    var from = msg.from_id
    var date = moment.unix(msg.date).fromNow()
    name = getName(from)
    box.add(date+' | '+(name || from)+' > '+msg.message)
  }
}

// - Entry Point -
// Load authKey and userdata from disk, then act depending on outcome
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
        fs.readFile(cfgDir+'user_data.json',function(err,data){
          if(err)
            log("FATAL: couldn't read user_data.json")
          else {
            try {
              log("Got User Data from disk: ",data)
              user = JSON.parse(data)
              connect()
            } catch (e) {
              log("FATAL: user data corrupted:",e)
            }
          }
        })
      }
    })
  } else {
    log('Key not found')
    connect()
  }
})
