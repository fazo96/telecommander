#!/usr/bin/env node

var data = {} // Hold all global data

var os = require('os')
var fs = require('fs')
var moment = require('moment')
var blessed = require('blessed')
var path = require('path')

data.cfgDir = path.join(process.env.XDG_CONFIG_HOME || (path.join(process.env.HOME || process.env.USERPROFILE, '/.config/')), 'telecommander/')
process.env.LOGGER_FILE = process.env.LOGGER_FILE || "/tmp/telecommander"
data.keyFile = path.join(data.cfgDir,'key')
data.userFile = path.join(data.cfgDir,'user_data.json')
data.telegramLink = require('telegram.link')()

// Load modules
require('./lib/cli.js')(data) // Parse command line args
require('./lib/util.js')(data) // Load utils
require('./lib/ui.js')(data) // Load ui

/* IF YOU FORK THE APP PLEASE CHANGE THE ID
 * AND HASH IN THE APP OBJECT! THEY IDENTIFY
 * THE APPLICATION CREATOR AND YOU CAN
 * OBTAIN YOURS FROM http://my.telegram.org
 */
data.app = {
  id: '42419',
  hash: '90a3c2cdbf9b391d9ed72c0639dc0786',
  version: require('./package.json').version,
  lang: 'en',
  deviceModel: os.type(),
  systemVersion: os.platform()+'/'+os.release()
}

// Logger
var getLogger = require('get-log')
getLogger.PROJECT_NAME = 'telecommander'
data.logger = getLogger('main')

data.authKey // our authorization key to access telegram
data.connected = false // keep track of wether we are good to go and logged in

// Write something in the Status box
data.log = function(){
  args = Array.prototype.slice.call(arguments)
  var msg = args.join(' ')
  data.getMsgBox(data.statusWindow).add(msg)
  data.logger.info(msg)
}

data.command = function(cmd){
  //cmdl = cmd.split(' ')
  //cmdname = cmdl[0]
  data.log('Commands are not implemented!')
}

// Send a message
data.sendMsg = function(name,str){
  if(!data.connected){
    return log('Error: not ready to send messages')
  }
  var obj = data.nameToObj(name)
  var peer = data.idToPeer(obj.id,obj.title?'group':'user')
  var randid = parseInt(Math.random() * 999999999)
  // Fix bug in telegram.link that doesn't send strings with accented letters
  str = str.replace('è',"e'").replace('ù',"u'").replace('à',"a'").replace('ò',"o'").replace('ì',"i'")
  //data.log('Sending Message to:',peer.toPrintable())
  data.client.messages.sendMessage(peer,str,randid,function(sent){
    data.log('Sent message:','"'+str+'"','to:',data.selectedWindow+':',sent.toPrintable())
  })
}

data.onPhoneCode = function(something,s){
  if(s === null){ // User cancelled
    process.exit(0)
  }
  var cmdl = s.split(' ')
  code = cmdl[0]
  name = cmdl[1]
  lastname = cmdl[2]
  if(((!name || !lastname) && !data.user.registered) || !code)
    return log('insufficient arguments:',cmd) // TODO: handle this better!
  var cb = function(result){
    data.user = data.user || {}
    data.user.id = ''+result.user.id
    data.user.phone = result.user.phone
    data.user.phoneCodeHash = result.phone_code_hash
    data.user.username = result.user.username
    data.user.first_name = result.user.first_name
    data.user.last_name = result.user.last_name
    data.user.dataCenter = data.dataCenter
    // Done, write user data and key to disk
    try {
      fs.mkdirSync(data.cfgDir,'0770')
    } catch (e) {
      if(e.code != 'EEXIST'){
        console.error("FATAL: couldn't create configuration directory",data.cfgDir,e)
        process.exit(-1)
      }
    }
    data.log('Writing Log In token and user data to',data.cfgDir)
    fs.writeFile(data.cfgDir+'key',data.app.authKey,function(err){
      if(err) data.log('FATAL: Could not write key to disk:',err)
    })
    fs.writeFile(data.cfgDir+'user_data.json',JSON.stringify(data.user),function(err){
      if(err) data.log("FATAL: couldn't write user_data.json:",err)
    })
    data.whenReady()
  }
  // Log in finally
  if(data.user.registered) data.client.auth.signIn(data.user.phone,data.user.phoneCodeHash,code,cb)
  else data.client.auth.signUp(data.user.phone,data.user.phoneCodeHash,code,name,lastname,cb)
}

data.useDatacenter = function(toDC,f){
  data.log('Using DC:',toDC)
  data.client.getDataCenters(function(dcs){
    data.dataCenters = dcs
    data.dataCenter = data.dataCenters[toDC || data.dataCenters.nearest]
    if(f && f.call) f(data.dataCenter)
  })
}

data.onPhoneNumber = function(something,s){
  if(s === null){ // User cancelled
    process.exit(0)
  }
  data.user.phone = s.trim()
  var mindate = moment()
  data.log('Checking your phone number with Telegram...')
  data.client.auth.sendCode(data.user.phone,5,'en',function(result){
    if(result.instanceOf('mtproto.type.Rpc_error')){
      if(result.error_code === 303){ // PHONE_MIGRATE_X error (wrong datacenter)
        data.load('Finding Datacenter...')
        data.useDatacenter('DC_'+result.error_message.slice(-1),function(dc){
          data.client.end(function(){
            data.connect(true)
          })
        })
      } else {
        data.switchToBox(data.statusWindow)
        data.log('Errors:',result.error_code,result.error_message)
      }
    } else { // NO ERROR
      //data.log('Res:',JSON.stringify(result))
      data.user.registered = result.phone_registered
      data.user.phoneCodeHash = result.phone_code_hash
      var msg
      if(!data.user.registered){
        msg = "Your number ("+data.user.phone+") is not registered.\nTelecommander will register your account with the Telegram service."
      } else {
        msg = "Your number ("+data.user.phone+") is already assigned to a Telegram account.\nTelecommander will log you in."
      }
      msg += "\nPress ESC to exit now, or enter to continue"
      data.popup.display(msg,0,function(){
        data.popup.hide()
        data.promptBox.input('Your telegram code:','',data.onPhoneCode)
      })
    }
  })
}

// Connects to telegram
data.connect = function(re){
  data.load(re?'Reconnecting...':'Connecting...')
  if(re){ // RE-connecting, from scratch (drop all data)
    data.app.authKey = undefined
  }
  data.client = data.telegramLink.createClient(data.app, data.dataCenter, function(){
    if(!data.app.authKey){
      data.log('Downloading Authorization Key...')
      data.client.createAuthKey(function(auth){
        data.app.authKey = auth.key.encrypt('password') // Will add security later, I promise
        // Writes the new encrypted key to disk
        data.loader.stop()
        //data.log('Ready for phone number, use command: phone <number>')
        data.promptBox.input('Phone number (international format):','+',data.onPhoneNumber)
      })
    } else {
      data.whenReady()
    }
  })

  data.client.once('dataCenter',function(dcs){
    data.log('Datacenters:',dcs.toPrintable())
  })
}

// Executed when connected and logged in
data.whenReady = function(){
  data.load('Connected')
  data.connected = true
  data.downloadData()
  data.chats.focus()
}

// Downloads stuff
data.downloadData = function(){
  data.load('Downloading data')
  data.client.contacts.getContacts('',function(cont){
    //data.chats.clearItems()
    //data.chats.add(data.statusWindow)
    //data.log(cont.toPrintable())
    cont.users.list.forEach(data.addUser)
    data.loader.stop()
  })

  data.client.messages.getDialogs(0,0,10,function(dialogs){
    if(dialogs && dialogs.chats && dialogs.chats.list)
      dialogs.chats.list.forEach(data.addGroup)
    data.loader.stop()
  })

  data.client.updates.getState(function(astate){
    data.updateState(astate)
    data.log(data.state.unreadCount,'unread messages')
    //data.log('Started receiving updates')
    // Can't use registerOnUpdates because it's apparently broken
    //data.client.registerOnUpdates(data.onUpdate)
    setTimeout(data.downloadUpdates,1000)
  })
}

data.downloadUpdates = function(){
  data.client.updates.getDifference(data.state.pts,data.state.date,data.state.qts,function(res){
    if(!res.instanceOf('api.type.updates.DifferenceEmpty')){
      //data.log('Got Diff: ',res.toPrintable())
      if(res.state){
        data.updateState(res.state)
      }
      if(res.chats)
        for(c in res.chats.list) data.addGroup(res.chats.list[c])
      if(res.users)
        for(c in res.users.list) data.addUser(res.users.list[c])
      if(res.new_messages){
        res.new_messages.list.forEach(function(msg){
          data.appendMsg(msg,undefined,false,false)
        })
      }
      if(res.other_updates){
        for(c in res.other_updates.list) data.onUpdate(res.other_updates.list[c])
      }
      data.rebuildChatList()
      data.refreshStatusBar()
    }
    setTimeout(data.downloadUpdates,1000)
  })
}

data.onUpdate = function(o){
  if(o.instanceOf('api.type.UpdateUserStatus')){
    data.updateOnlineStatus(o.user_id,o.status)
  }
}

// Get message history with given name in the given box
// BROKEN, need to be rethinked
data.getMessages = function(name,box){
  if(!data.connected){
    return // data.log('Uh cant get messages cuz not connected.....')
  }
  if(data.downloadingMessages == true) return
  //log('Name to obj:',name)
  var obj = data.nameToObj(name)
  if(!obj || !obj.id){
    return //data.log("Can't get messages",obj,obj.id,obj.title)
  }
  var type = obj.title?'group':'user'
  var peer = data.idToPeer(obj.id,type)
  //box.add('Downloading message history for '+name)
  if(!peer) return log('Could not find peer:',name)
  data.downloadingMessages = true
  var oldnlines = box.getLines().length
  if(data.selectedWindow === name) data.load('Downloading history...')
  data.client.messages.getHistory(peer,0,obj.oldest_message||0,box.height,function(res){
    //log(res.toPrintable())
    //log('Got history for: '+getName(peer.user_id||peer.chat_id,peer.chat_id?'group':'user'))
    if(!res.messages){
      return box.add(res.toPrintable())
    }
    res.messages.list.sort(function(msg1,msg2){
      return msg1.date - msg2.date
    })
    res.messages.list.reverse()
    res.messages.list.forEach(function(msg){
      data.appendMsg(msg,undefined,false,true)
    })
    if(box.data.downloadedHistoryTimes === 0) // Downloading messages for the first time
      box.setScrollPerc(100)
    //box.add(obj.oldest_message)
    box.data.downloadedHistoryTimes++
    data.loader.stop()
    data.downloadingMessages = false
  })
}

data.appendToUserBox = function(msg,context){
  var goesto
  if(context.messages.list.length > 0){
    if(context.messages.list[0].to_id.chat_id){
      // Group message
      //data.log('Chose',data.getName(context.messages.list[0].to_id.chat_id,'group'))
      goesto = data.getMsgBox(data.getName(context.messages.list[0].to_id.chat_id))
    }
  }
  if(goesto === undefined){
    if(context.users.list[0].user_id == data.user.id){
      goesto = data.getMsgBox(data.getName(context.users.list[1].id,'user'))
    } else{
      goesto = data.getMsgBox(data.getName(context.users.list[0].id,'user'))
    }
  }
  data.appendMsg(msg,goesto,true)
}

// Writes given telegram.link "message" object to given boxId
data.appendMsg = function(msg,toBoxId,bare,prepend){
  var box,param,obj
  if(toBoxId != undefined){
    box = toBoxId
  } else {
    if(msg.to_id.chat_id != undefined){
      // Is a group
      param = data.getName(msg.to_id.chat_id,'group')
      obj = data.groups[msg.to_id.chat_id]
    } else if(msg.from_id === msg.to_id.user_id || msg.from_id != data.user.id){
      param = data.getName(msg.from_id,'user')
      obj = data.contacts[msg.from_id]
    } else if(msg.to_id.user_id != undefined && msg.to_id.user_id != data.user.id) {
      // don't forget dat .user_id! don't need it in from_id...
      param = data.getName(msg.to_id.user_id,'user')
      obj = data.contacts[msg.to_id.user_id]
    }
    // Increase unread count if necessary
    if(data.selectedWindow != param || data.msgBox[param] === undefined){
      if(!obj.toread) obj.toread = 1
      else obj.toread++
    }
    // Update oldest and latest message reference
    if(!obj.oldest_message || parseInt(obj.oldest_message) > parseInt(msg.id))
      obj.oldest_message = parseInt(msg.id)
    if(!obj.latest_message || parseInt(obj.latest_message) < parseInt(msg.id))
      obj.latest_message = parseInt(msg.id)
    box = data.getMsgBox(param)
  }
  if(bare)
    box.add(msg)
  else {
    var id = msg.from_id
    if(!id){ // Weird zombie message!
      data.log('Zombie Message:',msg.toPrintable())
      return box
    } else { // Regular message
      var date = moment.unix(msg.date).format('DD-MM-YYYY H:mm')
      name = data.getName(id,'user',true)
      var txt = (name || id)+' {|} {grey-fg}'+date+'{/grey-fg}\n'
      if(msg.media){
        if(msg.media.photo)
          txt += '{grey-fg}>>>{/grey-fg} (Photo)'
        else if(msg.media.audio)
          txt += "{grey-fg}>>>{/grey-fg} (Audio Message) "+msg.media.audio.duration+" seconds"
        else if(!msg.message)
          txt += "{grey-fg}>>>{/grey-fg} (Unsupported Message)"
      }
      if(msg.message){
        txt += msg.message.split('\n').map(function(s){
          return '{grey-fg}>{/grey-fg} '+s
        }).join('\n')
      }
      if(prepend) box.prepend(txt)
      else box.add(txt)
    }
  }
  // Mark messages as read if needed
  if(param === data.selectedWindow) data.markAsRead(param)
  return box
}

// - Entry Point -
// Load authKey and userdata from disk, then act depending on outcome
data.load('Starting up...')
data.screen.render()
fs.exists(data.keyFile,function(exists){
  if(exists){
    //log('Authorization Key found')
    fs.readFile(data.keyFile,function(err,content){
      if(err)
        data.log('Error while reading key:',err)
      else {
        data.app.authKey = data.telegramLink.retrieveAuthKey(content,'password') // yeah sorry just testing
        data.log('Authorization Key found')
        fs.readFile(data.userFile,function(err,res){
          if(err)
            data.log("FATAL: couldn't read user_data.json")
          else {
            try {
              data.user = JSON.parse(res)
              if(data.user.dataCenter) data.dataCenter = data.user.dataCenter
              data.log('Welcome',data.getName(data.user.id,'user'))
            } catch (e) {
              data.log("FATAL: user data corrupted:",e)
            }
            data.connect()
          }
        })
      }
    })
  } else {
    data.connect()
  }
})
