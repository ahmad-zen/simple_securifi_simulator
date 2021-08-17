const fs = require("fs");
const express = require("express");

class SecurifiServerSimulator {
    securifiServer;
    connectedSockets = [];

    constructor(securifiPort){
        const socketServer = require("tls").createServer({
            cert: fs.readFileSync('./cert/securifi-server-cert.pem'),
            key: fs.readFileSync('./cert/securifi-server-key.pem'),
            ca: [fs.readFileSync('./cert/securifi-server-cert.pem')],
            requestCert: false,
            rejectUnauthorized: false
        }, (socket) => {
            this.connectedSockets.push(socket);
            console.log('server connected', socket.authorized ? 'authorized' : 'unauthorized');
            this.ConfigureListeners(socket);
        });

        this.securifiServer = socketServer;
        this.securifiServer.listen(securifiPort);
        console.log('started socket server');      
    }

    ConfigureListeners(socket){
        socket.on('end', function(end) {
            console.log('EOT (End Of Transmission)');
            console.log(socket.readyState);
            this.connectedSockets.map(s => {
                s.destroy();
            });
        });

        socket.on('data', function(data){
            console.log(`data received by securifi simulator: ${data}`);
        });

        socket.on('error', function(err){
            this.connectedSockets.map(s => {
                s.destroy();
            });
            console.error(err);
        });
    }

    EmitData(data){
        if(this.connectedSockets.length !== 0){
            this.connectedSockets.map(s => {
                s.write(`securifi_data_received: ${data}`)
            });
            console.log("emitted data");
        }
    }

    EmitAlmondList(almondList){
        if(this.connectedSockets.length !== 0){
            this.connectedSockets.map(s => {
                s.write(`almond_list_received: ${almondList}`);
            });
            console.log("emitted almond list");
        }
    }

    EmitDeviceList(deviceList){
        if(this.connectedSockets.length !== 0){
            this.connectedSockets.map(s => {
                s.write(`device_list_received: ${deviceList}`);
            });
            console.log("emitted device list");
        }
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

        this.httpServer.post('/DeviceData', (req,res) => {
            this.SendDeviceData(req.body);
            res.send(req.body);
        });

        this.httpServer.post('/AlmondList', (req,res) => {
            this.SendAlmondList(req.body);
            res.send(req.body);
        });

        this.httpServer.post('/DeviceList', (req,res) => {
            this.SendDeviceList(req.body);
            res.send(req.body);
        });
    }

    SendDeviceData(data){
        data = JSON.stringify(data);
        console.log(`Sending device data ${data}`);
        this.securifiServer.EmitData(data);
    }

    SendAlmondList(almondList){
        almondList = JSON.stringify(almondList);
        console.log(`Sending Almond List ${almondList}`);
        this.securifiServer.EmitAlmondList(almondList);
    }

    SendDeviceList(deviceList){
        deviceList = JSON.stringify(deviceList);
        console.log(`Sent Device List ${deviceList}`);
        this.securifiServer.EmitDeviceList(deviceList);
    }
}


let securifiServer = new SecurifiServerSimulator(1028);
let controller = new SecurifiServerController(5000, securifiServer);
controller.SetupRoutes();