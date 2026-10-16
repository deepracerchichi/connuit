import mongoose from "mongoose"

const stepSchema = new mongoose.Schema({
    nodeId: { type: String, required: true},
    status: {
        type: String,
        enum: ["pending", "skipped", "running", "succeeded", "failed"],
        required: true,
    },
    output: {type: mongoose.Schema.Types.Mixed},
    error: {type: String},
    startedAt: {type: Date, required: true},
    finishedAt: { type: Date },
    attempt: {type: Number, required: true, default: 1},
    decision: { type: String, enum: ["yes", "no"] },

},
{_id: false}
);

const runSchema = new mongoose.Schema({
    _id: {type: String},
    workflowId: {type: String, required: true},
    status: {
        type: String,
        enum: ["running", "pending", "succeeded", "failed"],
        required: true,
    },
    steps: {type: [stepSchema], default: []},
    // True once a failed run won't be tried again (the last attempt, or the daily AI limit),
    // so the editor can show the result right away instead of waiting for a retry.
    final: {type: Boolean, default: false},

}, {timestamps: true}
);

runSchema.index({workflowId: 1, createdAt: -1});

export const RunModel = mongoose.model("Run", runSchema);