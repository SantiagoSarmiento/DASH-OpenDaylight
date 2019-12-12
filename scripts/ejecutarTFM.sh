#!/bin/bash
cd /home/upm/escenarios/
sudo vnx -f Multicast_SW_MultiHost.xml -v -t
#Entradas de flujos basicas
sudo ovs-ofctl add-flow -OOpenflow13 s1 dl_type=0x0800,nw_proto=2,priority=65535,actions=output:controller
sudo ovs-ofctl add-flow -OOpenflow13 s1 dl_type=0x0800,nw_proto=1,priority=100,actions=output:controller
sudo ovs-ofctl add-flow -OOpenflow13 s1 dl_type=0x0806,priority=100,actions=output:controller
#Crear reglas de flujo unicast  entre host y servidor multicast
sudo vnx -f Multicast_SW_MultiHost.xml -v -x ping-server
#sudo watch ovs-ofctl dump-flows -OOpenflow13 s1

