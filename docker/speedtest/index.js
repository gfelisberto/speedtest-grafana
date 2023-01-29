const execa = require("execa");
const Influx = require("influx");
const delay = require("delay");

process.env.INFLUXDB_HOST = process.env.INFLUXDB_HOST
  ? process.env.INFLUXDB_HOST
  : "influxdb";
process.env.INFLUXDB_DB = process.env.INFLUXDB_DB
  ? process.env.INFLUXDB_DB
  : "speedtest";
process.env.INFLUXDB_USERNAME = process.env.INFLUXDB_USERNAME
  ? process.env.INFLUXDB_USERNAME
  : "root";
process.env.INFLUXDB_PASSWORD = process.env.INFLUXDB_PASSWORD
  ? process.env.INFLUXDB_PASSWORD
  : "root";
process.env.SPEEDTEST_HOST = process.env.SPEEDTEST_HOST
  ? process.env.SPEEDTEST_HOST
  : "local";
process.env.SPEEDTEST_INTERVAL = process.env.SPEEDTEST_INTERVAL
  ? process.env.SPEEDTEST_INTERVAL
  : 3600;

const baseArgs = [
        "--accept-license",
        "--accept-gdpr",
        "-f",
        "json"
]

const bitToMbps = (bit) => (bit / 1000 / 1000) * 8;

const log = (message, severity = "Info") =>
  console.log(`[${severity.toUpperCase()}][${new Date()}] ${message}`);

const getClosestServers = async (num_servers) => {
  const { stdout } = await execa("speedtest", baseArgs.concat("-L"));
  const result = JSON.parse(stdout);
  const servers = result.servers;
  var serverList = [];
  while (serverList.length < num_servers) {
    const randomServer = servers[Math.floor(Math.random() * servers.length)].id;
    if( !serverList.includes(randomServer)) {
        serverList.push(randomServer)
    }

  }
  return serverList;
}

const getSpeedMetrics = async (server_id) => {
  const { stdout } = await execa("speedtest", baseArgs.concat("--server-id=" + server_id));
  const result = JSON.parse(stdout);
  //log(JSON.stringify(result));
  return { 
	data: {
		upload: bitToMbps(result.upload.bandwidth),
		download: bitToMbps(result.download.bandwidth),
		ping: result.ping.latency,
		jitter: result.ping.jitter,
		url: result.result.url
	},
	tags: {
		server_id: result.server.id
	}
  };
};

const pushToInflux = async (influx, metrics) => {
  const points = Object.entries(metrics.data).map(([measurement, value]) => ({
    measurement,
    tags: { host: process.env.SPEEDTEST_HOST, server_id: metrics.tags.server_id },
    fields: { value },
  }));
  log("Influx data:" + JSON.stringify(points));
  await influx.writePoints(points);
};

(async () => {
  try {
    const influx = new Influx.InfluxDB({
      host: process.env.INFLUXDB_HOST,
      database: process.env.INFLUXDB_DB,
      username: process.env.INFLUXDB_USERNAME,
      password: process.env.INFLUXDB_PASSWORD,
    });

    while (true) {
      log("Starting new speedtest loop...");
      start = Date.now();
      // Either use the supplied servers or get 2 from the closest servers
      const servers = process.env.SPEEDTEST_SERVERS ?
        process.env.SPEEDTEST_SERVERS.split(' ') :
        await getClosestServers(2);
      for (var i = 0; i < servers.length; i++) {
        const serverId = servers[i];
        log(`Testing against ServerId: ${serverId}`);
        const speedMetrics = await getSpeedMetrics(serverId);
	//log("Returned object:" + JSON.stringify(speedMetrics));
        log(
          `Speedtest results - ServerId: ${serverId}, Download: ${speedMetrics.data.download}, Upload: ${speedMetrics.data.upload}, Ping: ${speedMetrics.data.ping}, Jitter:${speedMetrics.data.jitter}`
        );
        await pushToInflux(influx, speedMetrics);
	log(`Sleeping for ${process.env.SPEEDTEST_INTERVAL / servers.length } seconds...`);
	await delay(process.env.SPEEDTEST_INTERVAL * 1000 / servers.length)
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
