// init config
const config = require('config');
// init coinspot
const CoinspotClient = require('coinspot-api');
const csClient = new CoinspotClient(config.get('Coinspot.key'), config.get('Coinspot.secret'));
// init coinbase
const CoinbaseClient = require('coinbase').Client;
var cbClient = new CoinbaseClient({'accessToken': config.get('Coinbase.accessToken'), 'refreshToken': config.get('Coinbase.refreshToken')});
// init node packages
const cron = require('node-cron');
const rClient = require('restler');

// define some const
const arbitrage_threshold = 15;
const default_amount = 10;      // just a random number, all the fees and price are calculated by percentage, so this amount doesn't really matter
const default_currency = 'LTC'  // only currency that is viable to arbitrage at the moment
// Coinbase API get quote on buying 10 LTC
let coinbase_promise = function(){
    let promise = new Promise(function(resolve, reject){
        cbClient.getAccount(config.get('Coinbase.defaultAccountId'), function(err, account){
            //console.log(account);
            account.buy({
                "amount": default_amount.toString(),
                "currency": default_currency,
                "commit": false,
                "quote": true
            }, function(err, tx){
                // total amount with fee
                //console.log(tx.total.amount);
                // resolve, pass total amount AUD to callback
                resolve(tx.total.amount);
            })
        });
    });
    return promise;
}


// Coinspot API get quote on selling 10 LTC
let coinspot_promise = function(coinbase_price){
    let promise = new Promise(function(resolve, reject){
        csClient.quotesell('LTC', default_amount, function(err, data){
            let quote_rate = JSON.parse(data).quote;
            let transactionFeeRate = config.get('Coinspot.ltcFeeRate');
            let coinspot_price = quote_rate * default_amount * (1 - transactionFeeRate);
            // can only sell from coinspot, thus this percentage calculation is one-directional 
            let arbitrage_percent = (coinspot_price - coinbase_price) / coinbase_price;
    
            // resolve, pass total amount AUD to callback
            resolve({title:"Attention", percent:(arbitrage_percent * 100).toFixed(2)});
        })
    });
    return promise;
}

// Send notification
const sendPushNotification = function(data){
    // check arbitrage percentage threshold
    if(data.percent < arbitrage_threshold){
        console.log("Arbitrage percent not excceed threshold. % = " + data.percent);
        return null;
    }

    let post_params = {
        data:{
            token: config.get('PushOver.token'),
            user: config.get('PushOver.userKey'),
            message: `${default_currency} ${data.percent}%`,
            title: data.title,
            device: config.get('PushOver.deviceId')
        }
    }
    let promise = new Promise(function(resolve,reject){
        rClient.post('https://api.pushover.net/1/messages.json?', post_params).on('complete', function(data, response){
            let status = data.status;
            // 1: success, 2: error
            console.log(status);
            if(status == 1){
                resolve(status);
            }else{
                reject(status);
            }
        });
    });
    
    return promise;
}

// RUN
const main = function(){
    coinbase_promise()
    .then(coinspot_promise)
    .then(sendPushNotification, function(status){console.log("Sending message failed.")});
}

// Cron job: runs every hour
cron.schedule('0 * * * *', function(){
    main();
});