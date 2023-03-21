import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_group_name = 'Test_Room'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        print(self.channel_name)

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        print("Disconnected!")

    async def receive(self, text_data):
        # loads: json > python dict
        receive_dict = json.loads(text_data)
        # print('rd', receive_dict)
        message = receive_dict['message']
        action = receive_dict['action']

        if (action == 'new-offer') or (action == 'new-answer'):
            receiver_channel_name = receive_dict['message']['receiver_channel_name']

            # 현재 메시지를 보낸 클라이언트의 채널 네임 저장
            receive_dict['message']['receiver_channel_name'] = self.channel_name

            await self.channel_layer.send(
                receiver_channel_name,
                # send dict
                {
                    # compulsory key : data > function(actually sending the message to each peer)
                    'type': 'send.sdp',
                    'receive_dict': receive_dict
                }
            )
            
            return

        # whenever a new peer connects to a consumer is going to have unique channel name
        # and that's what we have to send to all other peers so that they know where to send
        # a response
        receive_dict['message']['receiver_channel_name'] = self.channel_name

        await self.channel_layer.group_send(
            self.room_group_name,
            # send dict
            {
                # compulsory key : data > function(actually sending the message to each peer)
                'type': 'send.sdp',
                'receive_dict': receive_dict
            }
        )

    async def send_sdp(self, event):
        receive_dict = event['receive_dict'] 

        # dumps: python dict > json
        await self.send(text_data=json.dumps(receive_dict))