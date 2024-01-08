import * as mqtt from "mqtt"
import MqttRequest from "mqtt-request"
import { readClinics, createClinic, updateClinic, deleteClinic } from "./controllers/v1/clinics.js"
import { allAppointments, createAppointment, readAppointment, updateAppointment } from "./controllers/v1/appointments.js"
import { getTimeslots, rateDentist, readDentists, updateDentist } from "./controllers/v1/dentists.js"
import { readUserId, updateUser, readUserNotifications, readUserAppointments, markUserNotificationsAsRead } from "./controllers/v1/users.js"
import { createTimeslot, deleteTimeslot, readTimeslots } from "./controllers/v1/timeslots.js"

const client = mqtt.connect(process.env.BROKER_URL)

MqttRequest.timeout = 5000;

/** @type {MqttRequest}*/
export const mqttReq = new MqttRequest.default(client);

console.log(`Broker URL: ${process.env.BROKER_URL}`)

mqttReq.response("v1/dentists/read", readDentists);
mqttReq.response("v1/dentists/ratings/create", rateDentist);
mqttReq.response("v1/dentists/timeslots/read", getTimeslots);
mqttReq.response("v1/dentists/update", updateDentist);

mqttReq.response("v1/users/update", updateUser);
mqttReq.response("v1/users/:userId/read", readUserId);
mqttReq.response("v1/users/:userId/notifications/read", readUserNotifications);
mqttReq.response("v1/users/notifications/update", markUserNotificationsAsRead);
mqttReq.response("v1/users/:userId/appointments/read", readUserAppointments);

mqttReq.response("v1/timeslots/delete", deleteTimeslot);
mqttReq.response("v1/timeslots/create", createTimeslot);
mqttReq.response("v1/timeslots/read", readTimeslots);

mqttReq.response("v1/appointments/all", allAppointments);
mqttReq.response("v1/appointments/read", readAppointment);
mqttReq.response("v1/appointments/create", createAppointment);
mqttReq.response("v1/appointments/update", updateAppointment);

mqttReq.response("v1/clinics/read", readClinics)
mqttReq.response("v1/clinics/create", createClinic);
mqttReq.response("v1/clinics/update", updateClinic);
mqttReq.response("v1/clinics/delete", deleteClinic);


client.on("connect", () => {
    console.log("scheduling-service connected to broker")
});
