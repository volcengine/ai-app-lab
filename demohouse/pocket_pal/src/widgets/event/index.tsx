import React from 'react';
import { defineWidget, z } from '@ai-app/agent';
import { MeetingCard } from '@/components/MeetingCard';

export default defineWidget({
    autoLoad: false,
    aiMeta: {
        id: 'event',
        description: '日程卡片',
        input: z.object({
            title: z.string().describe('title'),
            date: z.string().describe('date'),
            startTime: z.string().describe('startTime')
        })
    },

    render(props) {
        return (
            <div className="bg-[#F6F8FA]">
                <MeetingCard meeting={props} />
            </div>
        );
    }
});