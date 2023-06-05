import { fetchRedis } from "@/helpers/redis"
import { authOptions } from "@/lib/auth"
import { database } from "@/lib/database"
import { pusherServer } from "@/lib/pusher"
import { toPusherKey } from "@/lib/utils"
import { addFriendValidator } from "@/lib/validations/add-friend"
import { getServerSession } from "next-auth"
import { z } from "zod"

export async function POST( req: Request) {
    try{
        const body = await req.json()

        const { email: emailToAdd } = addFriendValidator.parse(body.email)

        const idToAdd = await fetchRedis('get',`user:email:${emailToAdd}`) as string

        if(!idToAdd) {
            return new Response('This person does not exist.', {status:400})
        }

        const session = await getServerSession(authOptions)

        if(!session) {
            return new Response('Unauthorized' , {status: 401})
        }

        if(idToAdd === session.user.id ){
            return new Response('You cannot add yourself as a friend', {
                status:400
            })
        }

        const isAlreadyAdded = await (fetchRedis('sismember',`user:${idToAdd}:incoming_friend_requests`,session.user.id)) as 0 | 1

        if(isAlreadyAdded){
            return new Response('Already added this user' , {status : 400})
        }

        const isAlreadyFriends = await(fetchRedis('sismember',`user:${session.user.id}:friends`,idToAdd)) as 0 | 1

        if(isAlreadyFriends){
            return new Response('Already friend to this user' , {status : 400})
        }

        pusherServer.trigger(
            toPusherKey(`user:${idToAdd}:incoming_friend_requests`),'incoming_friend_requests',{
                senderId: session.user.id,
                senderEmail:session.user.email
            })

        database.sadd(`user:${idToAdd}:incoming_friend_requests`,session.user.id)

        return new Response("OK")
    }catch(err){
        if(err instanceof z.ZodError){
            return new Response("INvalid request payload",{status: 442})
        }

        return new Response("Invalid request" , {status: 400})
    }
}