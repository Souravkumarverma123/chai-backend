import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

const createTweet = asyncHandler(async (req, res) => {
    const { content } = req.body
    
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Tweet content is required")
    }
    
    const tweet = await Tweet.create({
        content: content.trim(),
        owner: req.user._id
    })
    
    const createdTweet = await Tweet.findById(tweet._id).populate("owner", "fullName username avatar")
    
    return res
        .status(201)
        .json(new ApiResponse(201, createdTweet, "Tweet created successfully"))
})

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params
    const { page = 1, limit = 10 } = req.query
    
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID")
    }
    
    const user = await User.findById(userId)
    if (!user) {
        throw new ApiError(404, "User not found")
    }
    
    const options = {
        page: parseInt(page),
        limit: parseInt(limit)
    }
    
    const tweets = await Tweet.aggregatePaginate(
        Tweet.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(userId)
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "owner",
                    foreignField: "_id",
                    as: "owner",
                    pipeline: [
                        {
                            $project: {
                                fullName: 1,
                                username: 1,
                                avatar: 1
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    owner: {
                        $first: "$owner"
                    }
                }
            },
            {
                $sort: {
                    createdAt: -1
                }
            }
        ]),
        options
    )
    
    return res
        .status(200)
        .json(new ApiResponse(200, tweets, "User tweets fetched successfully"))
})

const updateTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    const { content } = req.body
    
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID")
    }
    
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Tweet content is required")
    }
    
    const tweet = await Tweet.findById(tweetId)
    if (!tweet) {
        throw new ApiError(404, "Tweet not found")
    }
    
    // Check if user owns the tweet
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only update your own tweets")
    }
    
    const updatedTweet = await Tweet.findByIdAndUpdate(
        tweetId,
        { $set: { content: content.trim() } },
        { new: true }
    ).populate("owner", "fullName username avatar")
    
    return res
        .status(200)
        .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"))
})

const deleteTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params
    
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID")
    }
    
    const tweet = await Tweet.findById(tweetId)
    if (!tweet) {
        throw new ApiError(404, "Tweet not found")
    }
    
    // Check if user owns the tweet
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You can only delete your own tweets")
    }
    
    await Tweet.findByIdAndDelete(tweetId)
    
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Tweet deleted successfully"))
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}
