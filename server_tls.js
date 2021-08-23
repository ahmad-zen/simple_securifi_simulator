const fs = require("fs");
const express = require("express");
const moment = require('moment');

class SecurifiServerSimulator {
    securifiServer;
    firmwareVersion = "01 0a 35 0d 01 00 03 0b 2e 02 01 02 20 00";

    constructor(securifiPort){
        const socketServer = require("tls").createServer({
            cert: fs.readFileSync('./cert/securifi-server-cert.pem'),
            key: fs.readFileSync('./cert/securifi-server-key.pem'),
            ca: [fs.readFileSync('./cert/securifi-server-cert.pem')],
            requestCert: false,
            rejectUnauthorized: false
        }, (socket) => {
            console.log('server connected', socket.authorized ? 'authorized' : 'unauthorized');
            this.ConfigureListeners(socket);
        });

        this.securifiServer = socketServer;
        this.securifiServer.listen(securifiPort);
        console.log('started socket server');      
    }

    ConfigureListeners(socket){
        var self = this;

        var keepAliveInterval = setInterval(() => {
            socket.write(JSON.stringify({"root":{"KeepAlive":"KEEP_ALIVE"}}));
        }, 60000);

        socket.on('end', function(end) {
            console.log('EOT (End Of Transmission)');
            clearInterval(keepAliveInterval);
            socket.destroy();
        });

        socket.on('error', function(err){
            clearInterval(keepAliveInterval);
            socket.destroy();
            console.error(err);
        });

        socket.on('data', function(data){
            // console.log(`command received by securifi simulator: ${data}`);
            //{"MobileInternalIndex":34,"CommandType":"UpdateDeviceIndex","AlmondMAC":"251176216363884","ID":"10","Index":10,"Value":"0a 0b 01 00"}
            try {
                let dataAsString = data+"";
                if(dataAsString.trim().endsWith('</root>')){
                    // let loginResponse = JSON.stringify({
                    //     "LoginResponse": {     
                    //       "$": {
                    //         "success": "true"
                    //       },
                    //       "UserID": "522244940",
                    //       "TempPass": "",
                    //       "IsActivated": "1",
                    //       "MinutesRemaining": "undefined"
                    //     }
                    // });
                    // socket.write(loginResponse);
                    // console.log(`login response sent to securifi worker ${loginResponse}`);
                    return;
                }

                let splitCommands = dataAsString.split('}');
                for(let i = 0; i < splitCommands.length; i++){
                    if(splitCommands[i] == ""){
                      continue;
                    }

                    let nextCommand = splitCommands[i] + "}";
                    let startOfObject = nextCommand.indexOf('{');
                    let endOfObject = nextCommand.indexOf('}') + 1;
                    let jsonString = nextCommand.substring(startOfObject, endOfObject);
                    console.log(`JSON as string: ${jsonString}`);

                    let command = JSON.parse(jsonString);
                    if(command.Value.substring(command.Value.length - 5).startsWith('01')){
                        if(command.Index == NaN){
                            console.log("no index, cannot respond");
                            return;
                        }

                        if((command.CommandType == 'UpdateDeviceIndex'))
                        {
                            console.log(`this: ${this.firmwareVersion}`);
                            console.log(`self: ${self.firmwareVersion}`);
                            //{"CommandType":"DynamicIndexUpdated","Action":"UpdateIndex","HashNow":"5af90a8f96962e61b4a864e4d0790798","Devices":{"10":{"DeviceValues":{"10":{"Name":"CUSTOM_MESSAGE","Value":"01 0a 35 0d 01 00 03 0b 2e 02 01 02 20 00","Type":"92","EndPoint":"1","CommandClassID":"-1","CommandIndex":"-1"}}}},"AlmondMAC":"251176216363884","time":"1629455392.06606"}
                            let response = JSON.stringify({
                                "CommandType":"DynamicIndexUpdated",
                                "Action":"UpdateIndex",
                                "HashNow":"9dca5eee5590afb2ad5736c38490e8b3",
                                "Devices":{
                                    [command.Index] : {
                                        "DeviceValues" : {
                                            "10" : {
                                                "Name":"CUSTOM_MESSAGE",
                                                "Value": self.firmwareVersion || "01 0a 0b 0d 01 00 03",//"01 0a 0b 0d 01 00 03 0b 2e 02 01 02 45 00",//this.firmwareVersion,
                                                "Type":"92",
                                                "EndPoint":"1",
                                                "CommandClassID":"-1",
                                                "CommandIndex":"-1"
                                            }
                                        }
                                    }
                                },
                                "AlmondMAC": command.AlmondMAC,
                                "time": moment().valueOf()
                            });
                            socket.write(response);
                            console.log(`DynamicIndexUpdated response sent to securifi worker ${response}`);
                        }
                    }
                }
            } catch (error) {
                console.log("could not parse request");
                console.log(error);
            }
        });
    }

    UpdateFirmwareVersion(data){
        //update the saved firmware variable 
        this.firmwareVersion = data;
        console.log(this.firmwareVersion);
    }
}

class SecurifiServerController {
    httpServer;
    securifiServer;

    constructor(apiPort, securifiServer){
        this.httpServer = express();
        this.httpServer.listen(apiPort);
        console.log("started controller");

        this.securifiServer = securifiServer;
    }

    SetupRoutes(){
        this.httpServer.use(express.json());

        this.httpServer.post('/UpdateFirmwareVersion', (req,res) => {
            res.send(this.UpdateFirmwareVersion(req.body));
        });
    }

    UpdateFirmwareVersion(data){
        this.securifiServer.UpdateFirmwareVersion(data.firmwareVersion);
        return(data.firmwareVersion)
    }
}


let securifiServer = new SecurifiServerSimulator(1028);
let controller = new SecurifiServerController(5000, securifiServer);
controller.SetupRoutes();