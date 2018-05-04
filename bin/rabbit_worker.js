#!/usr/bin/env node

const amqp = require('amqplib/callback_api');
const Executor = require('../lib/executor');
const mongoose = require('mongoose');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

amqp.connect('amqp://localhost', (err, conn) => {
  conn.createChannel((chErr, ch) => {
    const q = 'calculation_queue';

    ch.assertQueue(q, { durable: true });
    ch.prefetch(1);

    var connectionURL = 'mongodb://127.0.0.1:27017/cypress_cql_dev4'
    var connectionOptions = { poolSize: 10 };
    var connection = mongoose.createConnection(connectionURL, connectionOptions)

    const executor = new Executor(connection);
    
    console.log(' [*] Waiting for messages in %s. To exit press CTRL+C', q);

    ch.consume(q, (msg) => {
      const messageJSON = JSON.parse(msg.content.toString());
      console.log(messageJSON);
      if (messageJSON.type === 'async') {
        executor.execute(messageJSON.patient_ids, messageJSON.measure_ids, connection, messageJSON.options).then(
          // Success handler
          (result) => {
            console.log(`Calculated ${JSON.stringify(result)}`);
            ch.ack(msg);
          },
          // Failure handler
          (result) => {
            console.error(result);
            ch.ack(msg);
          }
        );
      } else if (messageJSON.type === 'sync') {
        executor.execute(messageJSON.patient_ids, messageJSON.measure_ids, connection, messageJSON.options).then(
          // Success handler
          (result) => {
            console.log(`Calculated ${JSON.stringify(result)}`);
            ch.sendToQueue(
              msg.properties.replyTo,
              Buffer.from(JSON.stringify(result)),
              { correlationId: msg.properties.correlationId }
            );
            ch.ack(msg);
          },
          // Failure handler
          (result) => {
            console.error(result);
            ch.ack(msg);
          }
        );
      }
    }, { noAck: false });
  });
});