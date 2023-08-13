# 搭建coturn服务器

利用[coturn](https://github.com/coturn/coturn.git)搭建stun/turn服务器。可以为webrtc提供服务。这里使用的是docker，直接安装coturn同理。

1.  拉取官方的镜像，本地生成一对公私钥以便支持tls

2.  添加本地配置`coturn.conf`

```bash
listening-port=3478
tls-listening-port=5349
listening-device=<primary-interface> # 网络接口，可以借助ip addr等查询，例如我的是eth0
listening-ip=<primary-ip> # 服务器内网ip
relay-ip=<primary-ip>
external-ip=PUBLIC-IP_ADDRESS
server-name=<server-name>
realm=<realm>
min-port=49160
max-port=49200
```

3.  启动脚本`start-coturn.sh`

```bash
#!/bin/bash

docker run -d --network=host \
    -v $(pwd)/coturn.conf:/etc/coturn/turnserver.conf \
    -v $(pwd)/turn_server_pkey.pem:/etc/turn_server_pkey.pem \
    -v $(pwd)/turn_server_cert.pem:/etc/turn_server_cert.pem \
    coturn/coturn \
    -n --log-file=stdout
```

4.  验证，可以通过<https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/>来验证，也可以使用coturn提供的工具turnutils\_stunclient

```bash
turnutils_stunclient <ip>
```

预期输出类似：

    ========================================
    RFC 5780 response 1
    0: IPv4. Response origin: : <some-ip>:<some-port>
    0: IPv4. Other addr: : <some-ip>:<some-port>
    0: IPv4. UDP reflexive addr: <some-ip>:<some-port>
