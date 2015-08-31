#!/usr/bin/env node

var os = require('os')
var fs = require('fs')
var moment = require('moment')
var blessed = require('blessed')

var data = {} // Hold all global data
require('./lib/util.js')(data) // Load utils
require('./lib/ui.js')(data) // Load ui

var path = require('path')

data.cfgDir = path.join(process.env.XDG_CONFIG_HOME || (path.join(process.env.HOME || process.env.USERPROFILE, '/.config/')), 'telecommander/')
process.env.LOGGER_FILE = data.cfgDir+'log'

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

try { fs.makeDirSync(cfgDir,'0770') } catch (e) { }

// Logger
var getLogger = require('get-log')
getLogger.PROJECT_NAME = 'telecommander'
data.logger = getLogger('main')

data.telegramLink = require('telegram.link')()
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
  cmdl = cmd.split(' ')
  cmdname = cmdl[0]

  if(cmdname === 'phone'){ // So the user can provide his phone numbah
    if(connected){
      return log("Silly user, you're already connected! We don't need that phone number")
    }
    user.phone = cmd.split(' ')[1]
    var mindate = moment()
    log('Checking your phone number with Telegram...')
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
        log("Your number is not registered. Telecommander will register your account with the Telegram service")
        log(gmd())
        log('Ready for phone code, use command: "code <code> <name> <lastname>" to register')
        log("If you don't want to sign up, just don't enter the code and press ESC to exit. No data was saved to the file system")
      } else {
        log("Your number is already assigned to a Telegram account. Telecommander will log you in.")
        log(gmd())
        log("If you don't want to sign in, just don't enter the code and press ESC to exit. No data was saved to the file system")
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
      log('Writing Log In token and user data to',cfgDir)
      fs.writeFile(cfgDir+'key',authKey,function(err){
        if(err) log('FATAL: Could not write key to disk:',err)
      })
      fs.writeFile(cfgDir+'user_data.json',JSON.stringify(user),function(err){
        if(err) log("FATAL: couldn't write user_data.json:",err)
      })
      whenReady()
    }
    // Log in finally
    if(user.registered) client.auth.signIn(user.phone,user.phoneCodeHash,code,cb)
    else client.auth.signUp(user.phone,user.phoneCodeHash,code,name,lastname,cb)
  } else {
    log('Command not found.')
  }
}

// Send a message
data.sendMsg = function(name,str){
  if(!data.connected){
    return log('Error: not ready to send messages')
  }
  var obj = data.nameToObj(name)
  var peer = data.idToPeer(obj.id,obj.title?'group':'user')
  var randid = parseInt(Math.random() * 1000000000)
  //log('Sending Message to:',peer.toPrintable())
  data.client.messages.sendMessage(peer,str,randid,function(sent){
    //log('Sent message:','"'+str+'"','to:',selectedWindow+':',sent.toPrintable())
  })
}

// Connects to telegram
data.connect = function(){
  data.client = data.telegramLink.createClient(data.app, data.telegramLink.PROD_PRIMARY_DC, function(){
    if(!data.app.authKey){
      log('Downloading Authorization Key...')
      data.client.createAuthKey(function(auth){
        data.app.authKey = auth.key.encrypt('password') // Will add security later, I promise
        // Writes the new encrypted key to disk
        data.log('Ready for phone number, use command: phone <number>')
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
  data.log('Connected')
  data.connected = true
  data.downloadData()
  data.chats.focus()
}

// Downloads stuff
data.downloadData = function(){
  data.log('Downloading data...')
  data.client.contacts.getContacts('',function(cont){
    data.chats.clearItems()
    data.chats.add(data.statusWindow)
    cont.users.list.forEach(data.addUser)
  })

  data.client.messages.getDialogs(0,0,10,function(dialogs){
    if(dialogs && dialogs.chats && dialogs.chats.list)
      dialogs.chats.list.forEach(data.addGroup)
  })

  data.client.updates.getState(function(astate){
    data.updateState(astate)
    data.log(data.state.unreadCount,'unread messages')
    //data.log('Started receiving updates')
    // Can't use registerOnUpdates because it's apparently broken
    //client.registerOnUpdates(onUpdate)
    setTimeout(data.downloadUpdates,1000)
  })
}

data.downloadUpdates = function(){
  data.client.updates.getDifference(data.state.pts,data.state.date,data.state.qts,function(res){
    if(!res.instanceOf('api.type.updates.DifferenceEmpty')){
      //log('Got Diff: ',res.toPrintable())
      if(res.state){
        data.updateState(res.state)
      }
      if(res.chats)
        for(c in res.chats.list) data.addGroup(c)
      if(res.users)
        for(c in res.users.list) data.addUser(c)
      if(res.new_messages){
        res.new_messages.list.forEach(function(msg){
          data.appendMsg(msg,undefined,false,true)
        })
      }
    }
    setTimeout(data.downloadUpdates,1000)
  })
}

// Get message history with given name in the given box
data.getMessages = function(name,box){
  if(!data.connected){
    return log('Uh cant get messages cuz not connected.....')
  }
  //log('Name to obj:',name)
  var obj = data.nameToObj(name)
  if(!obj || !obj.id){
    return data.log("Can't get messages",obj,obj.id,obj.title)
  }
  var type = obj.title?'group':'user'
  var peer = data.idToPeer(obj.id,type)
  box.add('Downloading message history for '+name)
  if(!peer) return log('Could not find peer:',name)
  data.client.messages.getHistory(peer,0,-1,100,function(res){
    //log(res.toPrintable())
    //log('Got history for: '+getName(peer.user_id||peer.chat_id,peer.chat_id?'group':'user'))
    if(!res.messages){
      return box.add(res.toPrintable())
    }
    res.messages.list.sort(function(msg1,msg2){
      return msg1.date - msg2.date
    })
    if(res.messages.list.length === 0)
      return data.appendToUserBox('No messages.',res)
    res.messages.list.forEach(function(msg){
      //if(!msg.message) return log('Empty message!',msg.toPrintable())
      //log('Scheduling message: '+msg.toPrintable())
      data.appendMsg(msg)
    })
  })
}

data.appendToUserBox = function(msg,context){
  var goesto
  if(context.messages.list.length > 0){
    if(context.messages.list[0].to_id.chat_id){
      // Group message
      data.log('Chose',data.getName(context.messages.list[0].to_id.chat_id,'group'))
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
data.appendMsg = function(msg,toBoxId,bare,smartmode){
  var box,param
  if(toBoxId != undefined){
    box = toBoxId
  } else {
    if(msg.to_id.chat_id != undefined){
      // Is a group
      param = data.getName(msg.to_id.chat_id,'group')
    } else if(msg.from_id === msg.to_id.user_id || msg.from_id != data.user.id){
      param = data.getName(msg.from_id,'user')
    } else if(msg.to_id.user_id != undefined && msg.to_id.user_id != data.user.id) {
      // don't forget dat .user_id! don't need it in from_id...
      param = data.getName(msg.to_id.user_id,'user')
    }
    if(smartmode && !bare){
      // Smart mode doesn't append the message to the box if it doesn't exist
      // because when created, the box will download message history
      if(data.msgBox[param] === undefined) return;
    }
    box = data.getMsgBox(param)
  }
  if(bare)
    box.add(msg)
  else {
    var from = msg.from_id
    var date = moment.unix(msg.date).fromNow()
    name = data.getName(from,'user')
    var txt
    if(msg.media){
      if(msg.media.photo)
        txt = ' <*> (Photo)'
      else if(msg.media.audio)
        txt = " <*> (Audio Message) "+msg.media.audio.duration+" seconds"
      else if(msg.message)
        txt = ' > '+msg.message
      else txt = " <*> (Unsupported Message)"
    }
    box.add(date+' | '+(name || from)+txt)
  }
}

// - Entry Point -
// Load authKey and userdata from disk, then act depending on outcome
data.screen.render()
var keyPath = data.cfgDir+'key'
data.log('Loading files...')
fs.exists(keyPath,function(exists){
  if(exists){
    //log('Authorization Key found')
    fs.readFile(keyPath,function(err,content){
      if(err)
        data.log('Error while reading key:',err)
      else {
        data.app.authKey = data.telegramLink.retrieveAuthKey(content,'password') // yeah sorry just testing
        data.log('Authorization Key found')
        fs.readFile(data.cfgDir+'user_data.json',function(err,res){
          if(err)
            data.log("FATAL: couldn't read user_data.json")
          else {
            try {
              data.user = JSON.parse(res)
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
