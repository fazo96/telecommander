var blessed = require('blessed')

function ChatBox(options) {
  var self = this
  if (!(this instanceof blessed.Node)) {
    return new ChatBox(options)
  }
  options = options || {}
  options.scrollable = true
  this.options = options
  blessed.Box.call(this, options)
  this.on('log',function(text){
    if(self.options.autoscroll) self.setScrollPerc(100);
    this.setLine(this.getLines().length-1,this.getLine(this.getLines().length-1).trim())
    self.screen.render()
  })
  this.on('prepend',function(){
    this.setLine(this.getLines().length-1,this.getLine(this.getLines().length-1).trim())
    self.screen.render()
  })
  this.on('click',function(){
    self.focus()
    self.screen.render()
  })
}

ChatBox.prototype.__proto__ = blessed.Box.prototype
ChatBox.prototype.type = 'chatbox'
ChatBox.prototype.add = ChatBox.prototype.log = function(){
  var text = Array.prototype.slice.call(arguments).join(' ')
  this.pushLine(text)
  this.emit('log',text)
}
ChatBox.prototype.prepend = function(){
  var text = Array.prototype.slice.call(arguments).join(' ')
  this.insertLine(0,text)
  this.emit('prepend',text)
}

module.exports = ChatBox
