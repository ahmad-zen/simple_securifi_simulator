const fs = require("fs");
const express = require("express");

class SecurifiServerSimulator {
    securifiServer;
    firmwareVersion = "01 0a 0b 0d 01 00 03 0b 2e 02 01 02 45 00";

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
        var keepAliveInterval = setInterval(() => {
            socket.write({"root":{"KeepAlive":"KEEP_ALIVE"}});
        }, 60000);

        socket.on('end', function(end) {
            console.log('EOT (End Of Transmission)');
            clearInterval(keepAliveInterval);
            socket.destroy();
        });

        socket.on('data', function(data){
            console.log(`command received by securifi simulator: ${data}`);
            //{"MobileInternalIndex":34,"CommandType":"UpdateDeviceIndex","AlmondMAC":"251176216363884","ID":"10","Index":10,"Value":"0a 0b 01 00"}
            let command = JSON.parse(JSON.stringify(data).substring(2));
            if(command.CommandType = 'UpdateDeviceIndex' && command.Value.substring(command.Value.length - 5).startsWith('01'))
            {
                if(command.Index == NaN){
                    console.log("no index, cannot respond");
                    return;
                }
                //{"CommandType":"DynamicIndexUpdated","Action":"UpdateIndex","HashNow":"9dca5eee5590afb2ad5736c38490e8b3","Devices":{"10":{"DeviceValues":{"10":{"Name":"CUSTOM_MESSAGE","Value":"01 0a 0b 0d 01 00 03 0b 2e 02 01 02 20 00","Type":"92","EndPoint":"1","CommandClassID":"-1","CommandIndex":"-1"}}}},"AlmondMAC":"251176216363884","time":"1629243631.59693"}
                let response = JSON.stringify({
                    "CommandType":"DynamicIndexUpdated",
                    "Action":"UpdateIndex",
                    "HashNow":"9dca5eee5590afb2ad5736c38490e8b3",
                    "Devices":{
                        [command.Index] : {
                            "DeviceValues":{
                                [command.Index]:{
                                    "Name":"CUSTOM_MESSAGE",
                                    "Value": firmwareVersion,
                                    "Type":"92",
                                    "EndPoint":"1",
                                    "CommandClassID":"-1",
                                    "CommandIndex":"-1"
                                }
                            }
                        }
                    },
                    "AlmondMAC":"251176216363884",
                    "time":"1629243631.59693"
                });
                socket.write(response);
                console.log(`response sent to securifi worker ${response}`);
            }
        });

        socket.on('error', function(err){
            socket.destroy();
            console.error(err);
        });
    }

    UpdateFirmwareVersion(data){
        //update the saved firmware variable 
        firmwareVersion = data;
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
            this.UpdateFirmwareVersion(req.body);
            res.send(req.body);
        });
    }

    UpdateFirmwareVersion(data){
        data = JSON.stringify(data);
        this.securifiServer.UpdateFirmwareVersion(data);
    }
}


let securifiServer = new SecurifiServerSimulator(1028);
let controller = new SecurifiServerController(5000, securifiServer);
controller.SetupRoutes();