Proyecto realizado por Santiago Sarmiento 
Agosto 2019
============================

# Dependencias 
VNX 
Controlador OpenDaylight - Descargar "ODL_Multicast" desde https://github.com/SantiagoSarmiento/ODL_Multicast.git

#Pasos para la ejecución del proyecto
	copiar en /home/upm/
	files/
	scripts/
	escensarios/
	ODL_Multicast/

1. Arrancar el controlador ODL 
$ cd /home/upm/
$ ODL_Multicast/distribution/opendaylight-karaf/target/assembly/bin/./karaf

1.1. En el CLI de ODL instalar el proyecto sdnhub-tutorial-learning-switch
opendaylight-user@root> feature:install sdnhub-tutorial-learning-switch

Verificar la instalación
opendaylight-user@root> feature:list -i | grep SDN

2. Arrancar el escenario virtualizado
El escenario arranca 7 contenedores lxc, 6 host y 1 server
```
$ cd /home/upm/escenarios/
$ ../scripts/ejecutarTFM.sh
```

3. Unir al grupo multicast los host deseados
h5 y h6 se encuentran bloqueados en el programa learning switch modificado para realizar multicast
 X número del host que se una al grupo multicast
```
$ cd /home/upm/escenarios/
$ sudo vnx -f Multicast_SW_MultiHost.xml -v -x join-multicast -M hX
```
Una vez se encuentren los host deseados escuchando una IP multicast, enviar los segmentos desde el servidor
```
$ sudo vnx -f Multicast_SW_MultiHost.xml  -v -x sendFULL-video
```
4. Verificación y reproducción del contenido dash en cada host
Abrir el navegador con la IP de cada host de la red privada con el anfitrion 
Verificar en Multicast_SW_MultiHost.xml 
```
http://<IP-host>/dash/samples/dash-if-reference-player/index.html
```
