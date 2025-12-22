import { AI_MODEL_LABEL } from "constants/settings.js"
import SearchAgent from "functions/search-agent.js"
import {
  defaultTestModel,
  mockAlertAccept,
  mockApp,
  mockNote,
  mockPlugin,
  noteTimestampFromNow,
  providersWithApiKey,
} from "../test-helpers.js"

const AWAIT_TIME = 60000;
const DEBUG_MULTIPLIER = 5; // When debugging tests, this will increase timeouts

// --------------------------------------------------------------------------------------
describe("Search Agent", () => {
  const plugin = mockPlugin();
  const availableModels = providersWithApiKey();
  // Choose model name randomly between "anthropic", "openai" and "gemini":
  const modelName = availableModels[Math.floor(Math.random() * availableModels.length)];
  const testModel = defaultTestModel(modelName);

  // --------------------------------------------------------------------------------------
  it("should find note with image and sandwich text", async () => {
    // Create 10 notes with varying content
    const notes = [
      mockNote("Beach Trip 2024", "# My Vacation\n\nBeach trip. Amazing sunset!", "note-001", {
        images: [{url: "https://example.com/beach.jpg"}],
        tags: ["vacation", "photos"], updated: noteTimestampFromNow({daysAgo: 7})
      }),
      mockNote("NYC Deli", "# Restaurant Review\n\nTried a new deli. Pastrami was great!", "note-002",
        {tags: ["food", "nyc"], updated: noteTimestampFromNow({monthsAgo: 1})}
      ),

      // Note 2: THE MATCH - Has both image and sandwich with mystery meat in New York, though it's
      // the least recent of notes, to make the challenge sporting
      mockNote("Street Food Discovery", "# Food Adventures in NYC\n\nFound an amazing street vendor in Manhattan. Had the most delicious sandwich with bologna that I couldn't identify, but it was incredible! Secret family recipe from New York. Need to find this cart again!\n\nSpicy tangy sauce.",
        "note-003", {
          images: [{url: "https://example.com/sandwich.jpg"}, {url: "https://example.com/vendor.jpg"}],
          tags: ["food", "nyc", "street-food"], updated: noteTimestampFromNow({monthsAgo: 11})
        }
      ),
      mockNote("Pizza Success", "# Pizza Night\n\nMade pizza from scratch. Perfect dough!", "note-004",
        {
          images: [{url: "https://example.com/pizza.jpg"}],
          tags: ["food", "cooking"], updated: noteTimestampFromNow({monthsAgo: 2})
        }
      ),
      mockNote("NY Food Guide", "# NY Restaurants\n\nBest places:\n- Joe's Pizza\n- Katz's Deli\n- Shake Shack",
        "note-005",
        {tags: ["food", "guide", "nyc"], updated: noteTimestampFromNow({monthsAgo: 3})}
      ),
      mockNote("Europe 2024", "# European Trip\n\nParis and Rome. Stunning architecture!", "note-006",
        {
          images: [{url: "https://example.com/eiffel.jpg"}, {url: "https://example.com/colosseum.jpg"}],
          tags: ["travel", "europe"], updated: noteTimestampFromNow({monthsAgo: 4})
        }
      ),
      mockNote("Sandwich Wishlist", "# Ideas\n\nTry:\n- BLT\n- Club\n- Reuben", "note-007",
        {tags: ["food", "todo"], updated: noteTimestampFromNow({monthsAgo: 5})}
      ),
      mockNote("Weekend BBQ", "# BBQ Party\n\nGrilled steaks and ribs. Great BBQ sauce!", "note-008",
        {
          images: [{url: "https://example.com/bbq.jpg"}],
          tags: ["food", "bbq", "party"], updated: noteTimestampFromNow({monthsAgo: 6})
        }
      ),
      mockNote("Q4 Planning", "# Meeting Notes\n\nQ4 goals and timeline. Follow up on budget.",
        "note-009", {tags: ["work", "meetings"], updated: noteTimestampFromNow({monthsAgo: 7})}
      ),
      mockNote("Architecture Notes", "# NYC Architecture\n\nIncredible buildings. Love Art Deco!",
        "note-010", {
          images: [{url: "https://example.com/building.jpg"}],
          tags: ["architecture", "nyc"], updated: noteTimestampFromNow({monthsAgo: 10})
        }
      )
    ];

    const app = mockApp(notes);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = testModel;
    const searchAgent = new SearchAgent(app, plugin);
    const userQuery = "Find the note with an image that mentions a sandwich with mystery meat in New York";
    const result = await searchAgent.search(userQuery);

    // Verify summary note was created
    expect(result.summaryNote).toBeDefined();
    expect(result.summaryNote.uuid).toBeDefined();

    // Verify the summary note title includes the AI model name
    expect(result.summaryNote.name).toContain(testModel);

    // Verify the summary note content includes the expected result note
    const summaryNote = app._allNotes.find(n => n.uuid === result.summaryNote.uuid);
    expect(summaryNote).toBeDefined();
    expect(summaryNote.body).toContain("Street Food Discovery");
    expect(summaryNote.body).toContain("note-003");

    // Verify we found the correct note
    expect(result.found).toBe(true);
    expect(result.notes).toBeDefined();
    expect(result.notes[0].uuid).toBe("note-003");
    expect(result.notes[0].name).toBe("Street Food Discovery");
    expect(result.confidence).toBeGreaterThan(6); // Should have high confidence

  }, AWAIT_TIME * DEBUG_MULTIPLIER);

  // --------------------------------------------------------------------------------------
  it("should filter candidates by tag requirement", async () => {
    const notes = [
      mockNote("Recipes from Mother", "# Food Recipes\n\nMy collection of cooking recipes and meal ideas.",
        "note-tag-001", {tags: ["food", "recipes"]}
      ),
      mockNote("Plain Jane the main dame", "# Plain Note\n\nTalks about food and cooking but has no tags.",
        "note-tag-002", {tags: []}
      )
    ];

    const app = mockApp(notes);
    mockAlertAccept(app);
    app.settings[AI_MODEL_LABEL] = defaultTestModel("anthropic");

    const searchAgent = new SearchAgent(app, plugin);
    const result = await searchAgent.search("Find food notes", { options: {
      tagRequirement: { mustHave: "food", preferred: null }
    }});

    expect(result.found).toBe(true);
    const bestResultNote = result.notes[0];
    expect(bestResultNote.uuid).toBe("note-tag-001");
  }, AWAIT_TIME * DEBUG_MULTIPLIER);

  // --------------------------------------------------------------------------------------
  describe("With a multitude of vaguely finance-related notes", () => {
    let notes;

    beforeEach(() => {
      const noteCandidateData = [
        [ "Unfiled screenshot picture moments memories record photo thoughts", "Collection of random screenshots I've taken over the years. Need to organize these better. Photos from conferences, random memes, architecture shots from my trip to Barcelona. Some pictures are worth keeping, others probably not. The memories captured here range from meaningful to completely random. I should create albums for different categories." ],
        [ "Light reading", "Just finished 'The Night Circus' by Erin Morgenstern. Beautiful prose and imaginative world-building. The story follows two young magicians bound in a competition. There's a quote I loved: 'The circus arrives without warning, its finances a mystery to all who attend.' The author really captures the mystique of the setting. Would recommend to anyone who enjoys magical realism and romance. Planning to read her other book 'The Starless Sea' next. Overall rating: 4.5 out of 5 stars." ],
        [ "Business Inbox Todo", "Tasks to complete this week: Review Q3 marketing materials, update website copy for new product launch, schedule dentist appointment, call mom for her birthday, research vacation destinations for summer trip. Also need to look into refinancing options - the interest rates have changed significantly. John mentioned some financial advisors but I need to vet their credentials first. Don't forget to pick up groceries on Thursday and submit expense reports by Friday. The new project timeline is worth reviewing before Monday's meeting." ],
        [ "Merge report - Is it time to retire the same old conventions? (Daylight Time)", "Merged performance optimization branch into main. Implemented lazy loading for images, reduced API calls by 40%, and optimized database queries. Initial benchmarks show page load time improved from 2.3s to 1.1s. This work is definitely worth the effort we put in. Cache invalidation strategy updated to prevent stale data issues. Monitoring metrics to ensure no regressions in production." ],
        [ "Unified Task List: A sorted list of every task you've ever created", "This is my master task list that aggregates everything from various projects and personal todos. Using a custom script to sort by priority and due date automatically. The net result is that I never miss deadlines anymore and have much better visibility into my workload. Contains tasks from work projects, home improvements, learning goals, and social commitments. Currently tracking 347 active tasks across 23 different categories. The system has transformed my productivity and reduced my stress levels significantly." ],
        [ "Merge report - Sun Aug 16 2020 08:56:51 GMT-0700 (Pacific Daylight Time)", "Follow-up merge to add monitoring and alerting for the payment processing fix. Implemented CloudWatch metrics to track transaction success rates in real-time. Added automated alerts for when failure rate exceeds 1%. This additional observability is worth having to catch similar issues faster in the future. Also updated runbook documentation for on-call engineers. Deployed to production without issues, monitoring dashboards look healthy." ],
        [ "Praise & Love Baby", "Collecting positive feedback and testimonials from Amplenote users. Sarah M. wrote: 'This app has completely transformed how I organize my research. The bidirectional linking and task management features are worth their weight in gold.' James K. said: 'Best note-taking app I've used in 10 years of trying different solutions.' We should feature these on the marketing site. The community enthusiasm is really motivating for the team. Planning to compile a monthly highlight reel of the best feedback to share internally." ],
        [ "Code quality targets: Advice on specific, substantiated goals for code quality", "Setting measurable code quality goals for our engineering team. Targets include: maintaining test coverage above 80%, keeping cyclomatic complexity under 10 for new functions, ensuring all public APIs have documentation, limiting file sizes to under 500 lines where possible. The net benefit of these standards is more maintainable code and faster onboarding for new developers. We should track these metrics in our CI/CD pipeline and fail builds that don't meet thresholds. Also considering adding automated code review tools like SonarQube to provide continuous feedback. Need to balance perfectionism with pragmatism - the goal is sustainable quality improvement, not blocking all progress. Team feedback has been mostly positive, though some developers feel the complexity limits are too strict for certain algorithmic code." ],
        [ "Working Toward Retirement Projections", "Current net worth calculation for 2025 retirement planning. Assets: Primary residence valued at $850K with $320K remaining mortgage, investment portfolio at $1.2M (60% stocks, 30% bonds, 10% alternatives), 401k balance of $450K, Roth IRA at $180K, savings accounts totaling $85K. Liabilities: Mortgage $320K, car loan $18K, no other debt. Total net worth: approximately $1.42. Projected retirement needs: $120K annual expenses in today's dollars, assuming 3% inflation and 6% average return on investments. Monte Carlo simulations suggest 89% probability of portfolio lasting 30 years post-retirement at age 65. Should consider increasing bond allocation as retirement approaches to reduce volatility. Estate planning documents need updating. Review and adjust quarterly. Recent market volatility has impacted short-term numbers but long-term trajectory remains solid. Consider maxing out HSA contributions for additional tax-advantaged savings. May want to consult with fee-only financial advisor to validate assumptions and strategy." ],
        [ "Dracula: The book & very large test note", "Reading Bram Stoker's Dracula for the first time and taking extensive notes. At times the vampire may be found retiring from his blood letting. The epistolary format is fascinating - the story unfolds through journal entries, letters, and newspaper clippings. Jonathan Harker's journey to Castle Dracula is appropriately creepy and atmospheric. The Count is portrayed as both sophisticated and monstrous. Lucy Westenra's transformation is tragic and disturbing. Van Helsing is an interesting character, combining scientific knowledge with folklore. One passage that caught my attention discusses the Count's resources: 'He has amassed wealth over centuries, his finances seemingly limitless, drawn from the spoils of countless victims and ancient treasures hidden in his castle vaults.' The novel explores themes of modernity versus superstition, sexuality, invasion anxiety, and the nature of evil. Mina Murray is perhaps the most capable character in the book, using the latest technology (the typewriter) to compile and organize information about Dracula. The final confrontation is somewhat rushed compared to the buildup. The book's influence on vampire fiction cannot be overstated - nearly every vampire trope can be traced back to this novel. Stoker did extensive research on Romanian folklore and geography. Some of the medical details are dated but the psychological horror remains effective. The theme of blood as both literal sustenance and metaphorical life force runs throughout. Overall, a landmark work of Gothic horror that deserves its classic status. Planning to watch some film adaptations to compare interpretations. The 1992 Coppola version is supposed to be visually stunning though it takes liberties with the source material." ],
        [ "Legacy Best & Worsts: 2019-2023", "Reflecting on the past five years to identify patterns and lessons learned. Best moments: Launched three successful products, built an amazing team, learned to delegate effectively, improved work-life balance, traveled to 12 countries, deepened important relationships, developed daily meditation practice. Worst moments: Burned out twice from overwork, made poor hiring decisions that cost time and energy, neglected physical health during crunch periods, missed important family events due to travel, let toxic client relationship continue too long. Key lessons: Sustainable pace beats heroic sprints, culture is worth investing in heavily, saying no is often the right answer, health must be non-negotiable, relationships require intentional effort. Looking forward: Want to maintain the good habits while being more proactive about preventing the bad patterns. The reflection process itself has been valuable for gaining perspective and clarity about priorities going forward." ],
        [ "💼 Outreach distribution tracking record history", "Tracking our B2B outreach campaigns for GitClear and Amplenote products. Q1 2025: Sent 1,250 personalized emails to engineering managers at Series A-C startups, 18% open rate, 4% response rate, 12 qualified leads, 3 converted to paid customers. Q2 2025: Attended 4 industry conferences, collected 200+ business cards, followed up with personalized demos, 15 trials started, 5 conversions. The campaigns are working but we need to optimize our messaging. Finance team wants better attribution tracking to understand which channels drive the most revenue. Currently using HubSpot for email automation and Salesforce for deal tracking. Need to integrate the two systems better to avoid manual data entry. The partnership with TechCrunch for sponsored content drove significant awareness but conversion rate was lower than email outreach. Planning to experiment with LinkedIn ads targeting CTOs and VPs of Engineering at companies with 50-500 employees. Budget allocated: $45K for Q3 campaigns. ROI so far has been positive at roughly 3.2x, but we're still in early stages of some deals that could significantly improve those numbers. Next steps: Refine ideal customer profile, A/B test email subject lines, create more case studies from happy customers, potentially hire SDR to handle initial outreach so sales team can focus on closing deals." ],
        [ "Puerto Vallarta Day 6, Committer Changelogs & AnalyzeMediaUpload", "Day 6 of vacation in Puerto Vallarta - spent the morning at the beach, afternoon working on code review and planning. Beautiful weather, crystal clear water. Reviewed committer changelogs for the past two weeks: Emma made excellent progress on the new dashboard analytics, Marcus fixed several edge cases in the media upload service, Priya refactored the authentication middleware. The AnalyzeMediaUpload feature is coming along well - we can now detect file types, scan for malware, generate thumbnails, extract metadata, and optimize images automatically. On the beach I was reading about Michael Jordan's retirement from basketball. What's fascinating is how he left the game at his peak in 1993 after winning three consecutive championships. His basketball career was absolutely legendary - six championships total, five MVP awards, ten scoring titles. The article mentioned that despite Jordan's individual success, the Bulls' financial situation wasn't terrific in the early years, with the team struggling to build a championship roster around him until Phil Jackson and Scottie Pippen arrived. Jordan's work ethic and competitive drive were unmatched. His brief retirement to play baseball is still puzzling to many sports analysts. When he returned in 1995, it was like he never left, leading the Bulls to another three-peat from 1996-1998. The comparison between his dedication to basketball and our team's dedication to building great software isn't lost on me. Excellence requires sustained effort, great teammates, and the right environment. Anyway, back to vacation mode. Planning to do some snorkeling tomorrow and then catch up on more code reviews in the evening." ],
        [ "New Years gimmick or goal pursuit innovation? Does it have to be just one?", "Thinking about New Year's resolutions and whether they're just cultural gimmicks or actually useful for personal development. The statistics show that most resolutions fail by February, which suggests the traditional approach isn't working for most people. But is that the fault of the concept or the execution? I think the problem is people set vague goals without systems to support them. Instead of 'get healthy' (vague), try 'go to gym every Monday, Wednesday, Friday at 6am' (specific). Instead of 'save money' (vague), try 'automatically transfer $500 to savings on first of month' (specific and automated). The real worth of the New Year moment is using it as a natural reset point, a Schelling point for change. But the actual goal achievement requires much more than just January 1st motivation - it requires building sustainable habits, tracking progress, adjusting when things aren't working, and having accountability mechanisms. So my answer is: New Years can be both gimmick and innovation depending on how you use it. The cultural moment provides helpful momentum, but you need real systems and commitment to turn that into lasting change. This year I'm trying a different approach: Instead of resolutions, I'm choosing three core areas to focus on (health, learning, relationships) and I'm setting up monthly reviews to assess progress and adjust tactics. We'll see if this works better than the traditional resolution approach. The key insight is that motivation fluctuates but systems can be stable if designed well." ],
        [ "Escaping the rat race: A bangin plan", "Updated retirement analysis for 2025 with current market conditions and revised assumptions. Current financial position in terms of net worth: Total assets of $2.80 including home equity, investment accounts, retirement accounts, and cash reserves. Annual household income of $285K, savings rate of 35%, living expenses of $95K per year. Projected retirement age: 62, life expectancy estimate: 90 (planning for 28 years of retirement). Investment allocation: Currently 70% equities, 25% bonds, 5% cash. Planning to shift to 50/40/10 by age 60 to reduce volatility risk. Expected annual returns: 7% real return during accumulation phase, 5% during retirement drawdown. Inflation assumption: 3% annually. Social Security estimate: $38K per year starting at age 67, present value of $45K in today's dollars. Healthcare costs: Estimating $15K annually until Medicare eligibility, then $8K annually for supplemental coverage and out-of-pocket expenses. Major upcoming expenses: Daughter's college in 3 years (expect $120K total after financial aid), potential home renovation in 5 years ($80K), new vehicle in 2 years ($45K). Tax considerations: Currently in 24% federal bracket, expect to be in 22% bracket during retirement due to lower income. Roth conversion ladder strategy could help minimize taxes on retirement withdrawals. Estate planning: Updated will and trust documents, designated beneficiaries on all accounts, have long-term disability and life insurance coverage. Risk factors: Market crash near retirement could significantly impact timeline - running scenarios shows that bear market in years 60-62 would require working 2-3 additional years. Sequence of returns risk is biggest concern. Mitigation strategies include maintaining 3 years of expenses in bond tent approaching retirement, having flexible retirement date, potentially pursuing part-time work in early retirement to reduce withdrawal rate. Monte Carlo analysis with 10,000 simulations shows 92% success rate for current plan, which is above our 85% comfort threshold. Key metrics to monitor: Net worth growth rate (target: 8% annually), savings rate (target: maintain above 30%), investment returns (compare to benchmarks quarterly), expense creep (should not exceed inflation). Next review scheduled for June 2025 or sooner if major life changes occur. Feeling confident about trajectory but remaining vigilant about assumptions and market conditions." ],
        [ "Slash & Learn: Our Q1 Headliner Carves Up Complexity, and Co-Headliners Worth a Look", "Q1 product updates newsletter draft for Amplenote users. Our flagship feature this quarter is the new Slash Command system that lets you quickly insert formatted elements without taking your hands off the keyboard. Type /table to insert a table, /code for a code block, /task for a checkbox, /date to insert timestamps. The system is worth exploring deeply because it dramatically speeds up note creation and reduces friction in capturing ideas. We've also shipped several co-headliner features: Improved mobile app performance (50% faster load times), enhanced search with fuzzy matching and filter options, new calendar integration that syncs with Google/Outlook, dark mode refinements based on user feedback, collaborative editing improvements with conflict resolution. Behind the scenes: Upgraded infrastructure to handle 10x current load, refactored core editor for better extensibility, improved security with end-to-end encryption for premium users. Looking ahead to Q2: Planning to launch AI-powered note summarization, better tag management with hierarchical tags, API for third-party integrations, improved offline mode. User growth has been strong - 25% increase in monthly active users, 35% increase in paid conversions. The team has been incredible, shipping high-quality features while maintaining stability and performance. Thanks to everyone who provided feedback and bug reports. Keep the suggestions coming as we continue building the best note-taking experience possible." ],
        [ "gpt-5.1 result: Net Worth & Retirement Estimates", "Query: Calculate my net worth and retirement projections based on current financial data. Response from GPT-5.1: Based on the financial information provided, here is your comprehensive net worth analysis and retirement projection. Current Net Worth Breakdown: Assets include primary residence ($500,000 current market value), investment portfolio ($1,340 across taxable brokerage, 401k, and Roth IRA), cash reserves ($92), and other assets including vehicles and personal property ($45). Total assets: $142.52. Liabilities include remaining mortgage balance ($35,000), car loan ($12,000), and no other significant debt. Total liabilities: $310,000. Current Net Worth: $1.42. Year-over-year growth: +$187,000 (+10.1%) driven primarily by market gains and continued savings contributions. Retirement Projection Analysis: Assuming retirement at age 64 (in 12 years), current savings rate of $4,000 annually, investment returns averaging 6.5% annually, and inflation at 2.8%, projected portfolio value at retirement will be approximately $3,850 in today's dollars. Based on the 4% safe withdrawal rule, this would support annual retirement spending of $154,000, which exceeds your stated retirement expense target of $11,000 annually. Monte Carlo simulation across 5,000 scenarios indicates 94% probability of portfolio sustaining 30-year retirement period without depletion. Key assumptions and sensitivities: Results are highly sensitive to investment returns (1% lower returns reduces success probability to 87%), sequence of returns risk in first 5 years of retirement is significant (market downturn of 30%+ in years 64-66 would require reducing withdrawals by 15-20% temporarily), healthcare costs could exceed estimates especially if long-term care is needed, Social Security claiming strategy (claiming at 70 vs 67 adds $18,000 annually in today's dollars). Recommendations: Consider increasing international equity exposure for diversification, evaluate Roth conversion opportunities given current tax rates, maintain emergency fund of 12 months expenses, review estate plan and beneficiary designations annually, consider purchasing long-term care insurance, develop retirement spending plan with priority-based expense categories. Overall assessment: Financial position is strong with high probability of successful retirement at target age. Main risks are market-related rather than savings-related. Confidence level: High." ],
        [ "Nice things said, compliments/affirmations received for the protagonist", "Collecting positive feedback to review when impostor syndrome strikes. From Emma: 'Your mentorship has been invaluable - you always make time to explain things thoroughly and you challenge me to think more deeply about problems. Working with you has accelerated my growth as an engineer.' From Marcus: 'I really appreciate how you give direct feedback while still being supportive. You have a gift for seeing the core issue and explaining it clearly. Your code reviews are tough but worth learning from every time.' From Sarah: 'Thank you for believing in my idea for the new analytics feature and giving me the autonomy to run with it. Your trust means a lot and motivates me to do my best work.' From the team retrospective: 'Ben creates psychological safety where we can admit mistakes and learn from them without fear of judgment.' From client Janet: 'You translated our vague requirements into a clear implementation plan and delivered exactly what we needed. The project would have gone off the rails without your leadership.' From Priya: 'I love that you encourage work-life balance and lead by example. You never send late-night messages or expect weekend work unless there's a true emergency.' These reminders help counteract the negative self-talk and keep perspective on contributions and impact." ],
        [ "Where are all the Mini-Musks?", "Essay exploring why we don't see more young entrepreneurs having massive impact in their 20s like previous generations. Elon Musk started Zip2 at 24, sold it at 28 for $307M. Mark Zuckerberg launched Facebook at 19, was a billionaire by 23. Bill Gates started Microsoft at 20. Larry Page and Sergey Brin launched Google at 25. Where are today's equivalents? Theories: Higher cost of living and student debt burden means young people can't afford to take risks. Previous generation had cheaper housing, education, and lower financial barriers to entrepreneurship. Increased regulatory complexity makes it harder to move fast and break things. Labor markets are more credentialist, favoring those with prestigious degrees and work experience. The low-hanging fruit has been picked in many industries. Counter-arguments: There's actually massive young talent, they're just building in different domains (AI, biotech, climate tech) with longer time horizons. The 'mini-Musks' are 10 years away from being recognized. Survivorship bias makes us overweight the previous generation's successes while ignoring their failures. Social media gives visibility to different types of success (influencers, creators) rather than traditional entrepreneurs. My take: The barriers have increased but the opportunities have also expanded. The next generation of transformative entrepreneurs will likely come from emerging fields where the rules aren't yet established. The finances and resources required are higher, but the potential impact is also greater given the scale of modern problems (climate change, aging populations, AI safety, space exploration). We should be patient and supportive rather than dismissive of young people trying to make a dent in the universe." ],
        [ "Product Q3 Updates: Agenda View, Righteous Upgrades, plus lots more", "Quarterly product update newsletter. Headline features for Q3: Custom background images for notes - personalize your workspace with photos or patterns, worth trying if you want more visual variety. Calendar events integration - see your schedule alongside your notes, create events directly from tasks. New Agenda View - unified view of tasks and calendar events sorted by date and priority, helps you plan your day more effectively. Additional improvements: Mobile app now supports offline editing with smart sync when connection restored. Improved table editing with drag-to-resize columns and better mobile support. Enhanced rich text formatting including highlights, subscript, and superscript. New keyboard shortcuts for power users (press ? to see full list). Tag autocomplete and suggestions based on your existing tags. Export improvements supporting Markdown, HTML, and PDF formats. Behind the scenes: Database performance optimizations reducing query times by 60%. Security enhancements including two-factor authentication and session management improvements. Infrastructure scaling to support our growing user base. What's coming in Q4: AI-powered features including auto-tagging and smart suggestions. Improved collaboration with real-time co-editing. Custom domains for published notes. Enhanced API for integrations. Community highlights: Shout out to our power users who provided detailed feedback and bug reports. Special thanks to the beta testers who helped us refine these features before launch. Join our Discord community to connect with other users and share tips. Growth update: We've crossed 100,000 monthly active users, with 15,000 paid subscribers. Thank you for being part of the Amplenote community and helping us build the future of note-taking." ],
        [ "Feedback for Jimmy's 2025 Plan", "Detailed feedback on the proposed 2025 strategic plan for the engineering team. Overall assessment: Strong vision with clear priorities, but timeline is aggressive and resource allocation needs adjustment. Specific feedback by section: Product Roadmap - The AI features are exciting but we need to staff up ML expertise before committing to Q1 delivery. Recommend pushing to Q2 and hiring 2 ML engineers now. The mobile rewrite is necessary but will take longer than estimated - budget 6 months not 4. Infrastructure goals - Migration to Kubernetes makes sense for scalability. The proposed architecture is solid but we should run proof of concept first before full commitment. Team structure - Proposed team expansion from 12 to 18 engineers is reasonable given growth targets. However, the finances for this expansion need clearer justification with expected ROI. Recommend creating business case showing how additional headcount translates to revenue through faster feature delivery and reduced churn. Process improvements - Agree that current deployment process is bottleneck. The proposed CI/CD upgrades should be priority. Two-week sprints are worth trying instead of current three-week cycle. Innovation time - Love the proposal for 10% innovation time. This will help with retention and could generate breakthrough ideas. Technical debt - Allocated time for tech debt is insufficient. Recommend increasing from 15% to 25% of capacity given current state. The authentication refactor in particular is critical for security and cannot be delayed. Summary: This is solid strategic thinking. Main adjustments needed are timeline expectations and resource planning. Let's discuss further in next week's planning meeting. Happy to collaborate on refined version." ]
      ]

      notes = noteCandidateData.map((noteData, index) => {
        return mockNote(noteData[0], noteData[1], `note-${ index }`, {
          updated: noteTimestampFromNow({ daysAgo: index * 3 })
        });
      });
    });

    it("should find notes related to user's net worth and retirement", async () => {
      const app = mockApp(notes);
      mockAlertAccept(app);
      app.settings[AI_MODEL_LABEL] = testModel;
      const searchAgent = new SearchAgent(app, plugin);
      const userQuery = "Return all the notes that discuss retirement projections and related content, like net worth calculations";
      const result = await searchAgent.search(userQuery);
      const expectedNames = [ "Working Toward Retirement Projections",
        "Escaping the rat race: A bangin plan",
        "gpt-5.1 result: Net Worth & Retirement Estimates",
      ];

      expect(result.summaryNote).toBeDefined();
      expect(result.found).toBe(true);
      expect(result.notes).toBeDefined();
      expect(expectedNames).toBe(result.notes.map(n => n.name).sort());
    }, AWAIT_TIME * DEBUG_MULTIPLIER);
  });
});
