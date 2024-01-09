import * as mqtt from "mqtt"
import MqttRequest from "mqtt-request"
import { readClinics, createClinic, updateClinic, deleteClinic } from "./controllers/v1/clinics.js"
import { allAppointments, createAppointment, readAppointment, updateAppointment } from "./controllers/v1/appointments.js"
import { getTimeslots, rateDentist, readDentists, updateDentist } from "./controllers/v1/dentists.js"
import { readUserId, updateUser, readUserNotifications, readUserAppointments, markUserNotificationsAsRead } from "./controllers/v1/users.js"
import { createTimeslot, deleteTimeslot, readTimeslots } from "./controllers/v1/timeslots.js"

const client = mqtt.connect(process.env.BROKER_URL, { clean: true })

MqttRequest.timeout = 5000;
MqttRequest.publishOptions = { qos: 2 }

/** @type {MqttRequest}*/
export const mqttReq = new MqttRequest.default(client);

console.log(`Broker URL: ${process.env.BROKER_URL}`)

mqttReq.response("$share/scheduling-service/v1/dentists/read", readDentists);
mqttReq.response("$share/scheduling-service/v1/dentists/ratings/create", rateDentist);

mqttReq.response("$share/scheduling-service/v1/timeslots/read", readTimeslots);
mqttReq.response("$share/scheduling-service/v1/dentists/timeslots/read", getTimeslots);
mqttReq.response("$share/scheduling-service/v1/timeslots/delete", deleteTimeslot);
mqttReq.response("$share/scheduling-service/v1/timeslots/create", createTimeslot);
mqttReq.response("$share/scheduling-service/v1/dentists/update", updateDentist);

mqttReq.response("$share/scheduling-service/v1/users/update", updateUser);
mqttReq.response("$share/scheduling-service/v1/users/:userId/read", readUserId);
mqttReq.response("$share/scheduling-service/v1/users/:userId/notifications/read", readUserNotifications);
mqttReq.response("$share/scheduling-service/v1/users/notifications/update", markUserNotificationsAsRead);
mqttReq.response("$share/scheduling-service/v1/users/:userId/appointments/read", readUserAppointments);

mqttReq.response("$share/scheduling-service/v1/appointments/all", allAppointments);
mqttReq.response("$share/scheduling-service/v1/appointments/read", readAppointment);
mqttReq.response("$share/scheduling-service/v1/appointments/create", createAppointment);
mqttReq.response("$share/scheduling-service/v1/appointments/update", updateAppointment);

mqttReq.response("$share/scheduling-service/v1/clinics/read", readClinics)
mqttReq.response("$share/scheduling-service/v1/clinics/create", createClinic);
mqttReq.response("$share/scheduling-service/v1/clinics/update", updateClinic);
mqttReq.response("$share/scheduling-service/v1/clinics/delete", deleteClinic);


client.on("connect", () => {
    console.log("scheduling-service connected to broker")
});

process.on('SIGINT', () => {
    client.end(); // since we're using a clean session, this unsubscribes from all topics
    console.log('Disconnected from MQTT broker');
    process.exit();
});
