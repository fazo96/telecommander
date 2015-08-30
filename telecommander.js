#!/usr/bin/env node

var path = require('path')
var cfgDir = path.join(process.env.XDG_CONFIG_HOME || (path.join(process.env.HOME || process.env.USERPROFILE, '/.config/')), 'telecommander/')
process.env.LOGGER_FILE = cfgDir+'log'

var os = require('os')
var fs = require('fs')
var moment = require('moment')
var blessed = require('blessed')

/* IF YOU FORK THE APP PLEASE CHANGE THE ID
 * AND HASH IN THE APP OBJECT! THEY IDENTIFY
 * THE APPLICATION CREATOR AND YOU CAN
 * OBTAIN YOURS FROM http://my.telegram.org
 */
var app = {
  id: '42419',
  hash: '90a3c2cdbf9b391d9ed72c0639dc0786',
  version: require('./package.json').version,
  lang: 'en',
  deviceModel: os.type(),
  systemVersion: os.platform()+'/'+os.release()
}

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
// unameToUid is used to match a name to its user id
var unameToUid = { }
// same thing for group name -> group object
var gnameToGid = { }

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

// Get msgBox for given group/user NAME, create if not exists
function getMsgBox(chat,switchto){
  if(chat === undefined){
    log('ERROR: asked for box for "undefined"!!')
    return msgBox[statusWindow]
  }
  if(!msgBox[chat]){
    log('Generating window: "'+chat+'"')
    msgBox[chat] = mkBox()
    screen.append(msgBox[chat])
    getMessages(chat,msgBox[chat])
  } // else log('Getting window','"'+chat+'"')
  if(switchto === true){
    switchToBox(chat)
  }
  return msgBox[chat]
}

// What happens when the user submits a command in the prompt
cmdline.on('submit',function(value){
  msgBox[statusWindow].add('< '+value)
  if(selectedWindow === statusWindow || nameToObj(selectedWindow) === undefined){
    //log('Window:',selectedWindow,'Eval cmd:',value)
    command(value)
  } else {
    // Send Message
    //log('sending message')
    sendMsg(selectedWindow,value)
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

function nameToObj(name){
  var id = gnameToGid[name]
  if(groups[id] && groups[id].title === name)
    return groups[id]
  else {
    id = unameToUid[name]
    return contacts[id]
  }
}

function idToPeer(uid,type){
  if(type === 'user')
    return new telegramLink.type.InputPeerContact({ props: { user_id: ''+uid } })
  else if(type === 'group')
    return new telegramLink.type.InputPeerChat({ props: { chat_id: ''+uid } }) 
}

// Send a message
function sendMsg(name,str){
  if(!connected){
    return log('Error: not ready to send messages')
  }
  var peer = idToPeer(nameToObj(name).id,nameToObj(name).title?'group':'user')
  var randid = parseInt(Math.random() * 1000000000)
  log('Sending Message to:',peer.toPrintable())
  client.messages.sendMessage(peer,str,randid,function(sent){
    log('Sent message:','"'+str+'"','to:',selectedWindow+':',sent.toPrintable())
  })
}

// Write something in the Status box
function log(){
  args = Array.prototype.slice.call(arguments)
  var msg = args.join(' ')
  msgBox[statusWindow].add(msg)
  logger.info(msg)
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
    cont.users.list.forEach(addUser)
  })

  client.messages.getDialogs(0,0,10,function(dialogs){
    dialogs.chats.list.forEach(addGroup)
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

function addUser(u){
  contacts[u.id] = { user: u, id: u.id}
  var name = getName(u.id,'user')
  unameToUid[name] = u.id
  chats.addItem(name)
}

function addGroup(group){
  if(groups[group.id]) return;
  if(group.left === true) return;
  groups[group.id] = { id: group.id, title: group.title }
  gnameToGid[group.title] = group.id
  chats.addItem(group.title)
  log('Added group:',group.title)
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
    if(!res.instanceOf('api.type.updates.DifferenceEmpty')){
      //log('Got Diff: ',res.toPrintable())
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
      if(res.chats){
        res.chats.list.forEach(function(c){
          if(!groups[c.id]){
            groups[c.id] = { id: c.id, title: c.title }
          }
        })
      }
    }
    setTimeout(downloadUpdates,1000)
  })
}

function getName(id,type){
  if(type === undefined) throw new Error('no type')
  if(type === 'group' && groups[id])
    return groups[id].title
  else if(type === 'user' && contacts[id]){
    var u = contacts[id].user
    return u.first_name + ' ' + u.last_name + (u.username?' (@'+u.username+')':'')
  } else log('Failed to find name for:',id)
}

// Get message history with given name in the given box
function getMessages(name,box){
  if(!connected){
    return log('Uh cant get messages cuz not connected.....')
  }
  //log('Name to obj:',name)
  var obj = nameToObj(name)
  if(!obj || !obj.id){
    return log("Can't get messages",obj,obj.id,obj.title)
  }
  var type = obj.title?'group':'user'
  var peer = idToPeer(obj.id,type)
  box.add('Downloading message history for '+name)
  if(!peer) return log('Could not find peer:',name)
  client.messages.getHistory(peer,0,-1,20,function(res){
    //log(res.toPrintable())
    log('Got history for: '+getName(peer.user_id||peer.chat_id,peer.chat_id?'group':'user'))
    if(!res.messages){
      return box.add(res.toPrintable())
    }
    res.messages.list.sort(function(msg1,msg2){
      return msg1.date - msg2.date
    })
    if(res.messages.list.length === 0)
      return appendToUserBox('No messages.',res)
    res.messages.list.forEach(function(msg){
      if(!msg.message) return log('Empty message!',msg.toPrintable())
      //log('Scheduling message: '+msg.toPrintable())
      appendMsg(msg)
    })
  })
}

function appendToUserBox(msg,context){
  var goesto
  if(context.messages.list.length > 0){
    if(context.messages.list[0].to_id.chat_id){
      // Group message
      log('Chose',getName(context.messages.list[0].to_id.chat_id,'group'))
      goesto = getMsgBox(getName(context.messages.list[0].to_id.chat_id))
    }
  }
  if(goesto === undefined){
    if(context.users.list[0].user_id == user.id){
      goesto = getMsgBox(getName(context.users.list[1].id,'user'))
    } else{
      goesto = getMsgBox(getName(context.users.list[0].id,'user'))
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
    if(msg.to_id.chat_id != undefined){
      // Is a group
      param = getName(msg.to_id.chat_id,'group')
    } else if(msg.from_id === msg.to_id.user_id || msg.from_id != user.id){
      param = getName(msg.from_id,'user')
    } else if(msg.to_id.user_id != undefined && msg.to_id.user_id != user.id) {
      // don't forget dat .user_id! don't need it in from_id...
      param = getName(msg.to_id.user_id,'user')
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
    name = getName(from,'user')
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
