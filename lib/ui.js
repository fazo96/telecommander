var blessed = require('blessed')
var ChatBox = require('./ui-widgets/chatbox.js')

module.exports = function(data){
  data.statusWindow = "Status"
  data.selectedWindow = data.statusWindow // the currently selected window

  // Get msgBox for given group/user NAME, create if not exists
  data.getMsgBox = function(chat,switchto){
    if(chat === undefined){
      log('ERROR: asked for box for "undefined"!!')
      return data.msgBox[statusWindow]
    }
    if(!data.msgBox[chat]){
      //log('Generating window: "'+chat+'"')
      data.msgBox[chat] = data.mkBox(chat)
      data.screen.append(data.msgBox[chat])
      data.getMessages(chat,data.msgBox[chat])
    } // else log('Getting window','"'+chat+'"')
    if(switchto === true){
      data.switchToBox(chat)
    }
    return data.msgBox[chat]
  }

  data.switchToBox= function(boxname){
    if(data.selectedWindow && data.msgBox[data.selectedWindow])
      data.msgBox[data.selectedWindow].hide()
    data.selectedWindow = boxname;
    if(data.selectedWindow != data.statusWindow)
      data.cmdline.setLabel('to '+data.selectedWindow)
    else
      data.cmdline.setLabel('Command for Telecommander')
    var newb = data.getMsgBox(data.selectedWindow)
    newb.show()
  }

  data.screen = blessed.screen({
    smartCSR: true,
    dockBorders: true
  })
  data.screen.title = "Telecommander"

  data.getDefaultStyle = function(){
    return {
      fg: 'white',
      border: { fg: 'grey'  },
      focus: {
        border: { fg: 'white' },
        scrollbar: {
          fg: 'white',
          bg: 'white'
        }
      },
      selected: { bold: true },
      scrollbar: {
        fg: 'white', bg: 'white',
        track: { fg: 'grey', bg: 'grey' }
      }
    }
  }

  // Contact list window
  data.chats = blessed.list({
    keys: true,
    label: 'Conversations',
    left: 0,
    top:0,
    height: data.screen.height-3,
    width: '20%',
    border: { type: 'line' },
    mouse: true,
    /*
    scrollbar: {
      ch: ' ',
      track : {
        ch: ' '
      }
    },
    */
    scrollbar: false, // disabled cause can't change track style when focused
    invertSelected: false,
    style: data.getDefaultStyle(),
  })

  // Function to create a log box
  data.mkBox = function(label){
    var b = ChatBox({
      keys: true,
      mouse: true,
      right: 0,
      label: label,
      width: '80%',
      hidden: true,
      height: data.screen.height - data.cmdline.height,
      border: { type: 'line' },
      scrollable: true,
      autoscroll: true,
      scrollbar: {
        ch: ' ',
        fg: 'white',
        track: {
          ch: ' ', fg: 'grey', bg: 'grey'
        }
      },
      style: data.getDefaultStyle()
    })
    b.key('enter',function(){
      data.cmdline.focus()
    })
    return b
  }

  // Command line prompt
  data.cmdline = blessed.textbox({
    keys: false,
    mouse: true,
    label: 'Command for Telecommander',
    bottom: 0,
    left: 'center',
    width: '100%',
    height: 3,
    border: { type: 'line' },
    style: data.getDefaultStyle()
  })

  // mgsBox holds the chat boxes for every list entry
  data.msgBox = { }
  data.msgBox[data.statusWindow] = data.mkBox(data.statusWindow)

  // Add stuff to the screen
  data.screen.append(data.chats);
  data.screen.append(data.msgBox[data.statusWindow]);
  data.screen.append(data.cmdline);
  data.chats.addItem(data.msgBox[data.statusWindow])
  data.switchToBox(data.statusWindow)
  data.screen.on('resize',function(){
    for(i in data.msgBox){
      item = data.msgBox[i]
      item.height = data.screen.height - data.cmdline.height
    }
    data.chats.height = data.screen.height - data.cmdline.height
    data.screen.render()
  })
  data.screen.key('tab',function(){
    data.screen.focusPush(data.chats)
  })

  data.command = function(cmd){
    cmdl = cmd.split(' ')
    cmdname = cmdl[0]

    if(cmdname === 'phone'){ // So the user can provide his phone numbah
      if(data.connected){
        return log("Silly user, you're already connected! We don't need that phone number")
      }
      data.user.phone = cmd.split(' ')[1]
      var mindate = moment()
      log('Checking your phone number with Telegram...')
      data.client.auth.sendCode(user.phone,5,'en',function(result){
        if(result.err_code){
          return log('Errors:',result.error_code,result.error_message)
        }
        //log('Res:',JSON.stringify(result))
        data.user.registered = result.phone_registered
        data.user.phoneCodeHash = result.phone_code_hash
        function gmd(){
          var m = moment()
          m = m.subtract(m.diff(mindate))
          return 'Please use a telegram code not older than '+m.fromNow(true)
        }
        if(!data.user.registered){
          data.log("Your number is not registered. Telecommander will register your account with the Telegram service")
          data.log(gmd())
          data.log('Ready for phone code, use command: "code <code> <name> <lastname>" to register')
          data.log("If you don't want to sign up, just don't enter the code and press ESC to exit. No data was saved to the file system")
        } else {
          data.log("Your number is already assigned to a Telegram account. Telecommander will log you in.")
          data.log(gmd())
          data.log("If you don't want to sign in, just don't enter the code and press ESC to exit. No data was saved to the file system")
        }
      })

    } else if(cmdname === 'code'){ // So the user can provide his phone code
      if(data.connected){
        return log("Silly user, you're already connected! We don't need that phone code")
      }
      code = cmdl[1]
      name = cmdl[2]
      lastname = cmdl[3]
      if(((!name || !lastname) && !data.user.registered) || !code)
        return log('insufficient arguments:',cmd)
      cb = function(result){
        data.user.id = ''+result.user.id
        data.user.phone = result.user.phone
        data.user.phoneCodeHash = result.phone_code_hash
        data.user.username = result.user.username
        data.user.first_name = result.user.first_name
        data.user.last_name = result.user.last_name
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
      data.log('Command not found.')
    }
  }

  // What happens when a different window is selected
  data.chats.on('select',function(selected){
    //data.log('SELECT:',selected.content)
    data.switchToBox(selected.content)
    data.cmdline.focus()
    data.screen.render()
  })
/*
  data.cmdline.on('click',function(){
    data.cmdline.focus()
    data.screen.render()
  })
*/
  // Catch ctrl-c or escape event and close program
  data.screen.key(['escape','C-c'], function(ch,key){
    data.quit()
  });

  data.cmdline.on('focus',function(){
    data.cmdline.readInput()
  })

  // What happens when the user submits a command in the prompt
  data.cmdline.on('submit',function(value){
    data.getMsgBox(data.statusWindow).pushLine('< '+value)
    if(data.selectedWindow === data.statusWindow || data.nameToObj(data.selectedWindow) === undefined){
      //log('Window:',selectedWindow,'Eval cmd:',value)
      data.command(value)
    } else if(value.indexOf('//') === 0){
      data.sendMsg(selectedWindow,value.substring(1))
    } else if(value.indexOf('/') === 0){
      data.command(value.substring(1))
    } else {
      data.sendMsg(data.selectedWindow,value)
    }
    data.cmdline.clearValue()
    data.cmdline.focus()
  })

}
