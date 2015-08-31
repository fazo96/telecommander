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
    if(!data.chats.getItem(name)) data.chats.addItem(name)
  }

  data.addGroup = function(group){
    if(data.groups[group.id]) return;
    if(group.left === true) return;
    if(group.title === undefined){
      return data.log('Undefined group title in group ',group)
    }
    data.groups[group.id] = { id: group.id, title: group.title }
    data.gnameToGid[group.title] = group.id
    if(!data.chats.getItem(group.title)) data.chats.addItem(group.title)
  }

  // Updates the current state
  data.updateState = function(newstate){
    data.state.pts = newstate.pts || data.state.pts
    data.state.qts = newstate.qts || data.state.qts
    data.state.date = newstate.date || data.state.date
    data.state.sqp = newstate.seq || data.state.sqp
    data.state.unreadCount = newstate.unread_count || data.state.unreadCount || 0
  }

  // process an update
  data.onUpdate = function(upd){
    data.log('Got Update:',upd.toPrintable())
  }

  data.nameForUser = function(u){
    return u.first_name + ' ' + u.last_name + (u.username?' (@'+u.username+')':'')
  }

  data.getName = function(id,type){
    if(id === data.user.id) return data.nameForUser(data.user)
    else if(type === undefined) throw new Error('no type')
    else if(type === 'group' && data.groups[id])
      return data.groups[id].title
    else if(type === 'user' && data.contacts[id])
      return data.nameForUser(data.contacts[id].user)
    else data.log('Failed to find name for',type,id)
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
