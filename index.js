const mqtt = require('mqtt');
const { safeLoad } = require('js-yaml');
const { readFile } = require('fs').promises;
const backlight = require('rpi-backlight');
const { getActiveWindow } = require('active-windows');

const timeout = (timeout) => new Promise(resolve => setInterval(() => resolve(), timeout));

(async () => {
    const configContent = await readFile('./config.yml');
    const config = safeLoad(configContent);

    const broker = mqtt.connect(config.mqtt.url);

    let backlightTopic = `homeassistant/light/${config.hass.entity_id}/backlight`;
    broker.publish(`${backlightTopic}/config`, JSON.stringify({
        '~': backlightTopic,
        name: `${config.hass.name} Backlight`,
        unique_id: `${config.hass.entity_id}-backlight`,
        cmd_t: '~/set',
        stat_t: '~/state',
        schema: 'json',
        brightness: true,
    }));
    let idleSensorTopic = `homeassistant/binary_sensor/${config.hass.entity_id}/idle`;
    broker.publish(`${idleSensorTopic}/config`, JSON.stringify({
        '~': idleSensorTopic,
        name: `${config.hass.name} Idle`,
        unique_id: `${config.hass.entity_id}-idle`,
        state_topic: '~/state'
    }));
    await publishBacklightState(broker, backlightTopic);
    broker.on('message', async (topic, message) => {
        if (topic === `${backlightTopic}/set`) {
            let payload = JSON.parse(message.toString());
            if (payload.state.toLowerCase() === 'on') {
                await backlight.powerOn();
            } else {
                await backlight.powerOff();
            }
            if (payload.brightness != null) {
                const current = await backlight.getBrightness();
                await fadeBrightness(current, payload.brightness);
            }
            await publishBacklightState(broker, backlightTopic);
        }
    });
    broker.subscribe(`${backlightTopic}/set`);
    let isIdle = null;
    setInterval(() => {
        const { idleTime } = getActiveWindow();
        const idle = parseInt(idleTime, 10) >= config.idle_timeout;
        if (idle === isIdle) {
            return;
        }
        broker.publish(`${idleSensorTopic}/state`, idle ? 'ON' : 'OFF');
        isIdle = idle;
    }, 100);
})();

async function publishBacklightState(broker, baseTopic) {
    broker.publish(`${baseTopic}/state`, JSON.stringify({
        state: await backlight.isPoweredOn() ? 'ON' : 'OFF',
        brightness: await backlight.getBrightness(),
    }));
}

async function fadeBrightness(from, to) {
    while (from !== to) {
        if (from > to) {
            --from;
        }else {
            ++from;
        }
        await backlight.setBrightness(from.toString());
        await timeout(16);
    }
}
