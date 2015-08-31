var blessed = require('blessed')

module.exports = function(data){
  // Contacts holds all the contacts data
  data.contacts = { }
  // Groups hold all the data about groups
  data.groups = { }
  // unameToUid is used to match a name to its user id
  data.unameToUid = { }
  // same thing for group name -> group object
  data.gnameToGid = { }
  data.user = { } // holds data about current user
  data.state = { } // keeps track of the telegram update state

  data.addUser = function(u){
    if(!data.user || !data.user.id) return log("Can't add invalid user object to contacts",u)
    data.contacts[u.id] = { user: u, id: u.id}
    var name = data.getName(u.id,'user')
    data.unameToUid[name] = u.id
    data.rebuildChatList()
    /*
    if(!data.chats.getItem(name)){
      data.chats.addItem(name)
      data.screen.render()
    }
    */
  }

  data.addGroup = function(group){
    if(data.groups[group.id]){
      if(group.title && group.title != data.groups[group.id].title){
        // Update title
        var old = data.groups[group.id].title
        data.groups[group.id].title = group.title
        data.chats.getItem(old).content = group.title
        data.screen.render()
        data.gnameToGid[old] = undefined
        return
      }
    }
    if(group.left === true) return;
    if(group.title === undefined){
      if(!isNaN(group)){ // Is ID
        data.groups[group] = { id: group, title: group }
      } else {
        var t = group.toPrintable ? group.toPrintable() : group
        data.log('Undefined group title in group ',group.toPrintable())
      }
    } else {
      data.groups[group.id] = { id: group.id, title: group.title, group: group }
      data.gnameToGid[group.title] = group.id
    }
    /*
    if(!data.chats.getItem(group.title)){
      data.chats.addItem(group.title)
      data.screen.render()
    }
    */
    data.rebuildChatList()
  }

  data.rebuildChatList = function(){
    var list = []
    for(c in data.contacts) list.push(data.contacts[c])
    for(c in data.groups) list.push(data.groups[c])
    function cmpstr(a,b){
      return data.getName(a.id,a.title?'group':'user').localeCompare(data.getName(b.id,b.title?'group':'user'))
    }
    list.sort(function(a,b){
      if(a.toread > 0 && b.toread > 0){
        var diff = a.toread - b.toread
        if(diff == 0) return cmpstr(a,b)
        return diff
      }
      if(a.toread > 0) return -1
      if(b.toread > 0) return 1
      return cmpstr(a,b)
    })
    data.chats.setItems(list.map(function(item){
      return data.getName(item.id,item.title?'group':'user',true)
    }))
    if(!data.chats.focused == data.screen.focused) data.chats.setScrollPerc(0)
    //data.chats.select(data.selectedWindow)
    data.screen.render()
  }

  data.markAsRead = function(name){
    var obj = data.nameToObj(name)
    if(obj === undefined) return
    obj.toread = 0
    data.client.messages.readHistory(data.idToPeer(obj.id,obj.title?'group':'user'),0,0,true)
    data.rebuildChatList()
  }

  // Updates the current state
  data.updateState = function(newstate){
    data.state.pts = newstate.pts || data.state.pts
    data.state.qts = newstate.qts || data.state.qts
    data.state.date = newstate.date || data.state.date
    data.state.sqp = newstate.seq || data.state.sqp
    data.state.unreadCount = newstate.unread_count || data.state.unreadCount || 0
  }

  data.getName = function(id,type,forChatList){
    var name,obj,toread
    if(type === undefined) throw new Error('no type')
    else if(id === data.user.id){
      obj = data.user
    } else if(type === 'group' && data.groups[id]) {
      obj = data.groups[id]
      toread = obj.toread
    } else if(type === 'user' && data.contacts[id]) {
      obj = data.contacts[id].user
      toread = data.contacts[id].toread
    } else data.log('Failed to find name for',type,id)
    if(obj === undefined){
      throw new Error("Can't find name for",type,id)
      return
    }
    if(type === 'user'){
      // User
      if(obj.first_name === undefined && obj.last_name === undefined && obj.username === undefined){
        data.log('Zombie User: '+obj)
        return 'undefined'
      }
      name = obj.first_name + (obj.last_name?' '+obj.last_name:'') + (obj.username?' (@'+obj.username+')':'')
    } else {
      // Group
      name = obj.title
    }
    if(forChatList && toread > 0) return '* '+name
    return name
  }

  data.escapeFromList = function(txt){
    return blessed.stripTags(txt.text || txt.content || String(text)).replace('* ','')
  }

  data.nameToObj = function(name){
    var id = data.gnameToGid[name]
    if(data.groups[id] && data.groups[id].title === name)
      return data.groups[id]
    else {
      id = data.unameToUid[name]
      return data.contacts[id]
    }
  }

  data.idToPeer = function(uid,type){
    if(type === 'user')
      return new data.telegramLink.type.InputPeerContact({ props: { user_id: ''+uid } })
    else if(type === 'group')
      return new data.telegramLink.type.InputPeerChat({ props: { chat_id: ''+uid } })
  }

  data.quit = function(){
    if(data.connected || data.client != undefined){
      data.log('Closing communications and shutting down...')
      data.client.end(function(){
        process.exit(0)
      })
    } else process.exit(0);
  }
}
