const amqp = require("amqplib");
const { MongoClient } = require("mongodb");
const { v4 } = require("uuid");

// Konfigurasi RabbitMQ
const rabbitmqHost =
  "amqp://absensi_rfid:absensi_rfid!@103.167.112.188:5672//absensi"; // Perbaikan URL RabbitMQ // user:password @ip server rabbitmq:5672//virtualhost
const rabbitmqQueue = "rfid";

// Konfigurasi MongoDB
const mongodbUrl = "mongodb://127.0.0.1:27017";
const mongodbDatabase = "PKL";
const mongodbCollection = "card";
const mongodbCollectionsync = "usercard";
const mongodbCollectioninstansi = "instansi";

// Fungsi untuk menyimpan pesan ke MongoDB dengan nomor urut yang diincrement
async function saveToMongoDB(message) {
  try {
    const client = await MongoClient.connect(mongodbUrl);
    const db = client.db(mongodbDatabase);
    const collection = db.collection(mongodbCollection);
    const collectionsync = db.collection(mongodbCollectionsync);
    const collectioninstansi = db.collection(mongodbCollectioninstansi);

    // Cek apakah RFID sudah terdaftar
    const existingData = await collection.findOne({ UID: message.UID });

    if (existingData) {
      console.log("RFID sudah terdaftar dalam database.");

      // Ambil data terkait dari TABEL 3 hanya jika belum ada
      const relatedData = await collectionsync.findOne({ CARD_ID: message.UID });
      // const instansiData = await collectioninstansi.findOne({ USER_ID });

      if (relatedData) {
        console.log("ini related data " + relatedData.USER_ID);
        console.log("ini related data " + relatedData.CARD_ID);

        // ... (lanjutkan dengan proses yang diperlukan untuk menyimpan data terkait TABEL 3)
      } else {
        console.log("...");
      }

      return;
    }

    // Mendapatkan nomor urut terakhir
    const lastDocument = await collection.findOne({}, { sort: { _id: -1 } });
    const lastNomorUrut = lastDocument ? parseInt(lastDocument.CODE.split("-")[1]) : 0;

    // Menambahkan nomor urut
    const newNomorUrut = lastNomorUrut + 1;
    const newCode = `CODE-${newNomorUrut}`;

    message.GUID = v4();
    message.CODE = newCode;

    // Simpan pesan ke MongoDB
    await collection.insertOne({
      GUID: message.GUID,
      UID: message.UID,
      MAC_ADDRESS: message.MAC_ADDRESS,
      SCAN_TIME: message.SCAN_TIME,
      CODE: newCode,
      STATUS_CARD: 0,
      CREATED_AT: new Date(),
      UPDATED_AT: new Date(),
    });

    client.close();
  } catch (error) {
    console.error("Error saat menyimpan pesan di MongoDB:", error);
  }
}




// Fungsi untuk mengonsumsi pesan dari RabbitMQ
async function consumeFromRabbitMQ() {
  try {
    const connection = await amqp.connect(rabbitmqHost);
    const channel = await connection.createChannel();
    await channel.assertQueue(rabbitmqQueue);

    console.log("Menunggu pesan. Tekan CTRL+C untuk keluar.");

    channel.consume(rabbitmqQueue, (msg) => {
      if (msg !== null) {
        const message = JSON.parse(msg.content.toString());
        console.log("Menerima pesan:", message);

        // Simpan pesan ke MongoDB dengan nomor urut yang diincrement
        saveToMongoDB(message);

        // Konfirmasi bahwa pesan telah diproses
        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error("Error saat mengonsumsi pesan dari RabbitMQ:", error);
  }
}

// Jalankan fungsi untuk mengonsumsi pesan
consumeFromRabbitMQ();
