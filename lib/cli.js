module.exports = function(data){
  data.cli = require('commander')
  data.cli
    .version('0.1.0')
    .description('the full-featured curses-like command line client for Telegram.\n\n  More Info: https://github.com/fazo96/telecommander')
    .usage('[options]')
    .option('-d, --debug', "debug mode")
    .option('-t, --testdc',"use Telegram's test DataCenter")
    .option('-n, --nuke','delete user data and access key (overdramatic log out)')
    .parse(process.argv)

    data.debug = data.cli.debug

    if(data.cli.testdc){
      data.dataCenter = data.telegramLink.TEST_PRIMARY_DC
    } else data.dataCenter = data.telegramLink.PROD_PRIMARY_DC

    if(data.cli.nuke){
      var fs = require('fs')
      try {
        fs.unlinkSync(data.keyFile)
        fs.unlinkSync(data.userFile)
      } catch (e){
        console.log("Couldn't delete "+data.keyFile+" and "+data.userFile+". They probably don't exist.")
      }
      console.log('Deleted',data.keyFile,'and',data.userFile)
      process.exit(0)
    }
}
