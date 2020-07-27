const mqtt = require('mqtt');
const { safeLoad } = require('js-yaml');
const { readFile } = require('fs').promises;
const backlight = require('rpi-backlight');

(async () => {
    const configContent = await readFile('./config.yml');
    const config = safeLoad(configContent);

    const broker = mqtt.connect(config.mqtt.url);

    let baseTopic = `homeassistant/light/${config.hass.entity_id}`;
    broker.publish(`${baseTopic}/config`, JSON.stringify({
        '~': baseTopic,
        name: config.hass.name,
        unique_id: config.hass.entity_id,
        cmd_t: "~/set",
        stat_t: "~/state",
        schema: "json",
        brightness: true,
    }));
    await publishState(broker, baseTopic);
    broker.on('message', async (topic, message) => {
        if (topic === `${baseTopic}/set`) {
            let payload = JSON.parse(message.toString());
            if (payload.state === 'ON') {
                await backlight.powerOn();
            }else {
                await backlight.powerOff();
            }
            if (payload.brightness != null) {
                await backlight.setBrightness(payload.brightness);
            }
            await publishState(broker, baseTopic);
        }
    });
    broker.subscribe(`${baseTopic}/set`);
})();

async function publishState(broker, baseTopic) {
    broker.publish(`${baseTopic}/state`, JSON.stringify({
        state: await backlight.isPoweredOn() ? 'ON' : 'OFF',
        brightness: await backlight.getBrightness(),
    }));
}
