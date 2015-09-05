# Telecommander

The experimental __full-featured curses-like command line client for Telegram__ is in heavy development, but also __already usable!__

![Demo](http://i.imgur.com/uv0Odoa.gif)

It uses [enricostara](http://github.com/enricostara)'s [telegram.link](http://github.com/enricostara/telegram.link) to connect to Telegram and [chjj](http://github.com/chjj)'s [blessed](http://github.com/chjj/blessed) for the UI.

In the GIF demo you can see how it looks. It was recorded with [ttystudio](http://github.com/chjj/ttystudio), which while being an excellent software, doen't really represent how good it looks with a nice font and proper color scheme. I removed most of my contacts by hacking the program to protect their privacy, but I actually have a few dozen of them and that doesn't cause issues.

### What it can and can't do

As of __now__, __Telecommander lets you__:

- Sign up for telegram
    - not sure it totally works, not really the priority for now! If it doesn't work and you need to sign up, use [Telegram Web](http://web.telegram.org)
- Sign in with a code sent via SMS or Telegram until you delete the Telecommander session files or the session expires
- Chat in groups and in private (it also marks messages as read when you read them)
- Know when you have unread messages
- View who's online and when was the last time someone logged in
- Do everything __completely in the terminal, even via ssh__ using only the keyboard
- Do everything (except writing messages, duh) using only the mouse, in the terminal!
- Navigate your contact and chat list
- Scroll back to view old messages

Waht's missing for version _0.1.0_ (__Almost done!__):

- Download latest messages on session start and show unreads

What's missing (for future versions up to 1.0)

- Create, modify, manage groups
- Secret chats
- Manage your contacts
- Manage your profile
- Easy bot interaction
- Send and view files, audio messages, images, videos, links
- Emoticons (they show up as question marks)
- Sign out (without having to manually delete files)
- Delete account
- Reply to and Forward message support
- Search, Tab completion, chatbox history
- Send multiline messages
- Themes and configurability! Basic scripting!
- Optimization
What could be available after 1.0:

- polished plugin API, scripting support
- Telecommander as a library
- Parsable output mode
- More cool stuff!

Most of features depend on [telegram.link](http://telegram.link)'s still alpha-quality implementation sadly, but it'll come around eventually.

### Installing

This section shows how to install Telecommander. It will be populated when __0.1__ is done!

### Hacking

To start Telecommander from source you'll need:

- __npm__, most of the time packaged with node
- __python__ version 2.x (probably need a recent one)
- __git__ to download the source

Let's set it up:

```sh
# Download the source

$ git clone https://github.com/fazo96/Telecommander.git
$ cd Telecommander

# If you just need to test it

$ npm install
$ ./telecommander.js

# If you want to install it

# Try with sudo if it doesn't work
$ npm install -g .
$ telecommander

# If npm install fails because of something about "gyp"
# it probably means your python points to python 3
# either swap it with python 2 or if you're on arch linux
# and/or your python 2 executable is "python2" just run this:

$ PYTHON=python2 npm install [-g .]
```

__PLEASE READ:__ if you fork the project and want to create a custom version of
Telecommander please change the app.id and app.hash values in the source
(should be in the first 30 lines of code) to the ones you can get
(for free) from http://my.telegram.org

### License

    The MIT License (MIT)

    Copyright (c) 2015 Enrico Fasoli (fazo96)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.
