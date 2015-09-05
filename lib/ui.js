var blessed = require('blessed')
var ChatBox = require('./ui-widgets/chatbox.js')

module.exports = function(data){
  data.statusWindow = "Status"
  data.selectedWindow = data.statusWindow // the currently selected window

  // Get msgBox for given group/user NAME, create if not exists
  data.getMsgBox = function(chat){
    if(chat === undefined){
      data.log('ERROR: asked for box for "undefined"!!')
      return data.msgBox[statusWindow]
    }
    if(!data.msgBox[chat]){
      //log('Generating window: "'+chat+'"')
      data.msgBox[chat] = data.mkBox(chat)
      data.screen.insertBefore(data.msgBox[chat],data.loader)
      //data.getMessages(chat,data.msgBox[chat])
    } // else log('Getting window','"'+chat+'"')
    return data.msgBox[chat]
  }

  data.switchToBox = function(boxname){
    // Hide current window
    if(data.selectedWindow && data.msgBox[data.selectedWindow])
      data.msgBox[data.selectedWindow].hide()
    if(boxname === undefined){
      // Leave the clear
      data.statusBar.hide()
    } else {
      // Switch window
      data.selectedWindow = boxname;
      if(data.selectedWindow != data.statusWindow){
        var obj = data.nameToObj(data.selectedWindow)
        data.cmdline.setLabel(data.getName(obj.id,obj.title?'group':'user','label'))
        data.markAsRead(data.selectedWindow)
      } else {
        data.cmdline.setLabel('Command for Telecommander')
      }
      var newb = data.getMsgBox(data.selectedWindow)
      data.refreshStatusBar()
      data.statusBar.show()
      newb.show()
      newb.emit('scroll')
    }
    data.screen.render()
  }

  data.refreshStatusBar = function(){
    var obj = data.nameToObj(data.selectedWindow)
    if(obj && obj.id)
      data.statusBar.setContent(data.getName(obj.id,obj.title?'group':'user','statusbar'))
    else data.statusBar.setContent(data.selectedWindow)
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
      selected: { bold: true, fg: 'white' },
      scrollbar: {
        fg: 'white', bg: 'white',
        track: { fg: 'grey', bg: 'grey' }
      }
    }
  }

  // Contact list window
  data.chats = blessed.list({
    keys: true,
    tags: true,
    label: 'Conversations',
    left: 0,
    top:0,
    height: data.screen.height-3,
    width: '20%',
    border: { type: 'line' },
    mouse: true,
    scrollbar: {
      ch: ' ',
      track : {
        ch: ' '
      }
    },
    //scrollbar: false, // disabled cause can't change track style when focused
    invertSelected: false,
    style: data.getDefaultStyle(),
  })
  data.chats.key('tab',function(){
    if(data.msgBox[data.selectedWindow])
      data.msgBox[data.selectedWindow].focus()
  })
  data.screen.append(data.chats)

  // Command line prompt
  data.cmdline = blessed.textbox({
    keys: false,
    tags: true,
    mouse: true,
    label: 'Command for Telecommander',
    bottom: 0,
    left: 'center',
    width: '100%',
    height: 3,
    border: { type: 'line' },
    style: data.getDefaultStyle()
  })
  data.screen.append(data.cmdline);

  // Function to create a log box
  data.mkBox = function(txt){
    var b = ChatBox({
      keys: true,
      tags: true,
      mouse: true,
      right: 0,
      top: 2,
      //label: { text: txt, side: 'left' },
      width: '80%',
      hidden: true,
      height: data.screen.height - data.cmdline.height - 2,
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
    b.on('focus',function(){
      data.statusBarStyle.border.fg = b.style.focus.border.fg
      data.screen.render()
    })
    b.on('blur',function(){
      data.statusBarStyle.border.fg = b.style.border.fg
    })
    var obj = data.nameToObj(txt)
    /*if(obj && obj.id)
      b.setLabel(data.getName(obj.id,obj.title?'group':'user','label'))*/
    b.data.downloadedHistoryTimes = 0
    b.key('enter',function(){
      this.setScrollPerc(100)
      data.cmdline.focus()
    })
    b.on('scroll',function(){
      // The functions might not yet exist if this is the first window
      if(b.getScrollPerc() === 100 && data.markAsRead)
        data.markAsRead(data.selectedWindow)
      else if(b.getScrollPerc() === 0 && data.getMessages){
        data.getMessages(txt,b)
      }
    })
    return b
  }

  data.statusBarStyle = data.getDefaultStyle()
  data.statusBarStyle.border.fg = 'white'
  data.statusBar = blessed.box({
    tags: true,
    input: false,
    keyable: false,
    keys: false,
    border: { type: 'line' },
    height: 3,
    right: 0,
    top: 0,
    width: '80%',
    style: data.statusBarStyle
  })
  data.screen.append(data.statusBar)

  data.getDefaultPopupStyle = function(){
    return {
      width: '30%',
      key: true,
      height: 'shrink',
      left: 'center',
      top: 'center',
      align: 'center',
      valign: 'center',
      border: { type: 'line' },
      style: data.getDefaultStyle()
    }
  }

  // Widget used to show loading windows
  data.loader = blessed.Loading(data.getDefaultPopupStyle())
  data.screen.append(data.loader)
  data.load = function(msg){
    data.loader.stop()
    data.loader.load(msg)
  }

  // Widget used to ask for phone number and code
  data.promptBox = blessed.Prompt(data.getDefaultPopupStyle())
  data.screen.append(data.promptBox)

  // Widget used to show pop up read only messages
  data.popup = blessed.Message(data.getDefaultPopupStyle())
  data.screen.append(data.popup)
  data.popup.hide()

  // mgsBox holds the chat window instance for every chat
  data.msgBox = { }

  // Add the status window but don't show it
  data.msgBox[data.statusWindow] = data.mkBox(data.statusWindow)
  data.screen.append(data.msgBox[data.statusWindow])
  data.switchToBox()

  data.screen.on('resize',function(){
    for(i in data.msgBox){
      item = data.msgBox[i]
      item.height = data.screen.height - data.cmdline.height
    }
    data.chats.height = data.screen.height - data.cmdline.height
    data.screen.render()
  })
  data.screen.enableMouse()
  data.screen.on('mouse',function(){
    data.updateLastKnownAction()
  })
  data.screen.on('keypress',function(){
    data.updateLastKnownAction()
  })
  /* // Commented out cause doens't work on most terminals
  data.screen.on('focus',function(){
    data.log('Screen Focus')
  })
  data.screen.on('blur',function(){
    data.log('Screen blur')
  })
  */
  data.screen.key('tab',function(){
    data.screen.focusPush(data.chats)
  })
  data.screen.key('0',function(){
    data.switchToBox(data.statusWindow)
  })
  data.command = function(cmd){
    data.log('Commands are not implemented... sorry!')
  }

  // What happens when a different window is selected
  data.chats.on('select',function(selected){
    //data.log('SELECT:',selected.content)
    if(selected === undefined) return
    var sel = data.escapeFromList(selected)
    data.switchToBox(sel)
    data.msgBox[data.selectedWindow].focus()
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
    data.getMsgBox(data.statusWindow).add('< '+value)
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
