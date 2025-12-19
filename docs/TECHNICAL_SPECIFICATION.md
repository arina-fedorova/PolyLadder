# PolyLadder Technical Specification

Project: PolyLadder
Type: Product-grade language learning system
Language: English
Status: Authoritative

================================================================

## 1. Introduction

### 1.1 Purpose

This document describes the PolyLadder system: what it does, who it is for, and how it is organized. The document serves as the single source of truth for all technical decisions. If something is not described here or contradicts this document, it is an error.

The intended audience includes developers, designers, and anyone making decisions about the system.

### 1.2 Scope

PolyLadder helps people learn foreign languages. The main feature is parallel learning of multiple languages at once, when it makes cognitive sense (for example, learning Romance languages together).

The system consists of four parts. First, a linguistic knowledge base that grows over time and never loses quality. Second, a background service that continuously adds new data to the base, validates it, and approves it. Third, an operator interface to see what is happening with the data and make decisions. Fourth, the learning application itself where users study languages.

The system does not handle social features, cloud synchronization, or marketing. These are deliberate constraints, not forgotten features.

### 1.3 Definitions

**Approved Data** is data that has passed all checks and been explicitly approved. Only approved data is shown to users during learning.

**CEFR** is the European framework for language proficiency levels from A1 to C2. The system uses an extended version with level A0 for basic orthography and phonetics.

**Meaning** is an abstract semantic unit not tied to any specific language. For example, "greeting when meeting someone" is a Meaning. The phrases "Hello", "Ciao", "Olá" are realizations of this Meaning in different languages.

**Base Language** is the language the learner already knows well. The learner chooses it once during setup. All explanations, definitions, and initial introductions use this language. The base language can be any supported language, for example English.

**Utterance** is a specific phrase in a specific language that expresses a particular Meaning.

**SRS** stands for Spaced Repetition System. It is an algorithm that shows material for review at optimal time intervals.

================================================================

## 2. Overall Description

### 2.1 Product Perspective

PolyLadder is a cloud-hosted web application for language learning. Users access it through a browser from any device. The application and all data are hosted centrally.

The linguistic knowledge base is shared among all users. There is no reason to duplicate the same vocabulary, grammar, and exercises on every device. The Content Refinement Service runs on the server and grows the knowledge base for everyone.

User progress is individual. Each user has their own account with personal learning history, vocabulary state, and SRS schedules.

The product value comes from two equally important layers. The first layer is a governed linguistic knowledge base with strict quality control. The second layer is a learning application that transforms this data into an effective learning experience. Neither layer is optional.

### 2.2 Product Functions

At the highest level, the system performs four functions.

It stores and protects linguistic knowledge. Every piece of data goes through a strict lifecycle before it can be used for learning. Once approved, data is never silently changed or deleted.

It continuously grows the knowledge base. A background service generates new content, validates it, and promotes it to approved status. This happens automatically without manual intervention for each item.

It gives the operator visibility and control. The operator can see what data exists, what is pending approval, and what failed validation. The operator makes explicit decisions about what gets approved.

It teaches languages to users. The learning application presents approved data through exercises, tracks progress, and adapts to the learner's needs.

### 2.3 User Classes

There are two logical roles in the system. These may be the same person.

The **Learner** is the primary user. This person wants to study multiple foreign languages, potentially in parallel. The learner interacts only with approved data through the learning application.

The **Data Operator** monitors the health of the knowledge base. This person reviews candidates, approves or rejects data, and investigates validation failures. The operator uses a separate interface designed for data management.

### 2.4 User Accounts

Users must register to use the application. Registration requires an email and password. After registration, the user selects their base language and languages they want to learn.

Each user account stores personal data: learning progress, vocabulary state, SRS schedules, and preferences. This data is private to the user.

Authentication is required to access the application. Users log in with their credentials and remain logged in until they explicitly log out or their session expires.

### 2.5 Operating Environment

The system runs in the cloud. The backend, database, and Content Refinement Service are hosted on a server. Users access the application through a web browser.

The hosting should be cost-effective for a small user base initially, with the ability to scale if needed. The specific hosting solution is an implementation decision, not a specification requirement.

Users need a modern web browser and internet connection. The application should work on desktop and mobile browsers.

### 2.6 Data Ownership

The system has two categories of data with different ownership.

**Shared data** belongs to the system and is the same for all users. This includes the linguistic knowledge base: meanings, utterances, grammar rules, exercises, orthography data, and the curriculum graph. Shared data is created by the Content Refinement Service and approved through the data governance pipeline. Users consume this data but cannot modify it.

**User data** belongs to individual users and is private. This includes learning progress, vocabulary state, SRS schedules, exercise history, and preferences. Each user sees only their own data.

### 2.7 Constraints

The initial set of languages includes English (US), Italian, Portuguese (Portugal), Slovenian, and Spanish (Spain). The architecture supports adding new languages without structural changes. When displayed together, languages follow alphabetical order by code.

Orthography and phonetics are mandatory prerequisites. A learner cannot access vocabulary or grammar for a language until they complete the orthography gate for that language.

All data must go through the full lifecycle. There are no shortcuts to approved status.

### 2.8 Assumptions

The learner is fluent in at least one supported language, which becomes their base language.

The learner has a device with a modern web browser and internet connection.

The learner has a device capable of audio playback. Audio recording is needed for pronunciation practice.

The operator and learner may be the same person, especially in early use.

================================================================

## 3. Business Requirements

### 3.1 Primary Goals

The system must enable efficient language acquisition. Learning should be faster and deeper than unstructured self-study.

The system must support parallel learning where it provides cognitive benefit. Related languages like Spanish, Italian, and Portuguese should be learnable side by side with explicit comparison and contrast.

The system must guarantee that learning quality improves over time. As the knowledge base grows, the learning experience must get better, never worse.

### 3.2 Secondary Goals

The system should create a reusable linguistic corpus. The data has value beyond this specific application.

The system should be commercially viable without fundamental redesign. If the product is successful, it should be possible to offer it to other users without rewriting the architecture.

The system should maintain long-term trust in learning materials. Users should be confident that what they learn is correct.

### 3.3 Business Rules

Only approved data may be used for learning. Non-approved data exists only in the pipeline and is never visible to learners.

Approved data is immutable. Once something is approved, it cannot be silently modified. Corrections happen by adding new approved data and optionally deprecating the old data.

Every approved item must be traceable to an explicit approval event. There is no data in the system without a clear record of how it got there.

================================================================

## 4. Core System Overview

PolyLadder consists of four subsystems. Each subsystem has a distinct responsibility and clear boundaries.

**Data Governance Core** protects data quality. It enforces lifecycle rules and guarantees immutability of approved data. This is the foundation that everything else depends on.

**Content Refinement Service** grows the knowledge base. It runs continuously in the background, generating candidates, validating them, and promoting them to approved status. It knows what to do next and can resume after being stopped.

**Operational UI** makes data visible. It lets the operator see counts by lifecycle state, inspect individual items, approve or reject candidates, and investigate failures. This is where human oversight happens.

**Learning Application** delivers value to learners. It transforms approved data into exercises, tracks progress, and provides a structured learning path. This is the product that users interact with.

================================================================

## 5. Data Governance Core

### 5.1 Purpose

The Data Governance Core exists to protect quality. It ensures that bad data never reaches learners and that good data is never lost or corrupted.

### 5.2 Data Lifecycle

Every piece of data in the system exists in one of four states.

**DRAFT** is raw data that has just been created. It might come from an LLM, a parser, an import, or manual entry. Draft data is unstructured and unvalidated.

**CANDIDATE** is data that has been normalized to fit the internal schema. It has the right shape but has not been checked for quality.

**VALIDATED** is data that has passed all automatic quality checks. The system believes it is correct, but it has not been explicitly approved.

**APPROVED** is data that has been explicitly promoted to trusted status. Only approved data is used for learning. Approved data is immutable.

### 5.3 Lifecycle Rules

Promotion from DRAFT to CANDIDATE happens automatically when data is normalized.

Promotion from CANDIDATE to VALIDATED happens automatically when all quality gates pass.

Promotion from VALIDATED to APPROVED requires explicit action. This may be automatic (if configured) or manual (operator decision).

There is no demotion. Data does not move backwards through the lifecycle. If approved data is found to be incorrect, new correct data is added and the old data is deprecated.

### 5.4 Immutability Guarantee

Approved data must never be modified in place. The fields, values, and relationships of approved items are fixed forever.

Approved data must never be silently deleted. If data needs to be removed from active use, it is marked as deprecated but remains in the database.

This guarantee is essential for long-term trust. Learners can be confident that what they learned yesterday is still valid today.

================================================================

## 6. Content Refinement Service

### 6.1 Purpose

The Content Refinement Service is the engine that grows the knowledge base. It runs in the background, continuously or on-demand, producing new approved data.

### 6.2 How It Works

The service operates as a loop. It checks what work needs to be done, does a unit of work, records progress, and repeats. When stopped and restarted, it picks up where it left off.

The service knows what to do next based on the current state of the database. If orthography data is missing for a language, it generates orthography. If meanings exist but utterances are missing, it generates utterances. The priorities are defined by a plan.

### 6.3 Data Sources

The service can use any source to generate candidate data. Common sources include LLMs for generating text, external linguistic resources for reference, and rule-based generation for systematic content.

No source is trusted by default. All generated data enters the pipeline as DRAFT and must pass the same lifecycle as any other data.

### 6.4 Resumability

The service maintains its own state. It tracks what has been processed, what is in progress, and what failed. If the service crashes or is stopped, it can resume from the last checkpoint.

This is critical for reliability. The knowledge base grows over weeks and months. The service must not lose progress or duplicate work.

================================================================

## 7. Quality Assurance

### 7.1 Quality Gates

Every piece of data must pass a series of quality gates before it can be approved. Failure of any gate blocks approval.

**Schema validation** ensures data has the correct structure and required fields.

**Duplication detection** prevents the same content from being approved twice.

**Language standard enforcement** ensures data matches the defined standard for each language (US English, Portugal Portuguese, etc.).

**CEFR level consistency** ensures data is appropriate for its assigned level and does not reference concepts from higher levels.

**Prerequisite consistency** ensures data does not depend on concepts that have not been approved yet.

**Orthography consistency** ensures spelling and character usage match the language standard.

**Content safety filtering** blocks profanity, offensive content, and unsafe material.

### 7.2 Validation Failures

When data fails validation, it is not simply rejected. The failure is recorded with details about which gate failed and why. This information is visible in the Operational UI.

Failed data can be fixed and resubmitted. The service may automatically retry with corrections, or the operator may manually intervene.

================================================================

## 8. Operational UI

### 8.1 Purpose

The Operational UI exists for human oversight. It makes the state of the knowledge base visible and enables explicit decisions about data quality.

### 8.2 Core Capabilities

The operator can see how much data exists in each lifecycle state. This gives a quick health check: is the pipeline working? Is data flowing through?

The operator can inspect individual items. For any candidate or validated item, the operator can see the content, source, and validation results.

The operator can approve or reject items. This is the explicit action that promotes data to approved status.

The operator can investigate failures. When validation fails, the operator can see why and decide whether to fix, retry, or discard the data.

The operator can explore the approved corpus. This helps verify that approved data is correct and complete.

### 8.3 Value

The Operational UI prevents silent quality degradation. Without visibility, bad data could accumulate without anyone noticing.

The Operational UI provides confidence. The operator knows exactly what data exists and how it got there.

================================================================

## 9. Learning Application

### 9.1 Purpose

The Learning Application is the product layer. It transforms approved data into a structured, effective learning experience.

### 9.2 Incremental Development

Learning features are developed incrementally. Each feature is a product increment with clear learner value, dedicated UI, and defined completion criteria.

Features can be released independently. A learner can start using the system as soon as basic features exist, even while advanced features are still being developed.

### 9.3 Curriculum Structure

Learning follows a structured curriculum, not random exercises. The curriculum is organized into units, and each unit covers a coherent topic: a grammar concept, a vocabulary domain, or a communicative function.

A typical unit contains theory, examples, and practice. Theory explains the concept in the base language with clear rules and patterns. Examples show the concept in use across all studied languages, highlighting similarities and differences. Practice reinforces understanding through varied exercises.

The system tracks what the learner knows and builds on prior knowledge. New material references only concepts that have already been learned. This prevents gaps and confusion.

### 9.4 Grammar Lessons

Grammar is taught explicitly with structured lessons. Each grammar topic includes an explanation of the rule, examples in context, comparison across languages where relevant, and exercises that test understanding.

Grammar lessons are not optional extras. They are core content. A learner cannot skip grammar and just memorize phrases. The system enforces grammar prerequisites before advancing to content that requires them.

### 9.5 Vocabulary System

The system tracks vocabulary at the word level. Each word the learner encounters is classified into one of three states.

**Unknown** means the learner has not seen this word yet or has seen it but not learned it.

**Learning** means the learner has started studying this word but has not demonstrated mastery.

**Known** means the learner has demonstrated reliable recall and production of this word.

Vocabulary is not learned in isolation. Words are introduced in context through example sentences and texts. The system tracks which words appear in which contexts to ensure varied exposure.

The learner can see their vocabulary size at any time, broken down by language and by state. This provides concrete progress measurement.

### 9.6 Practice Modes

Practice reinforces what has been learned through varied exercise formats.

**Recall practice** shows a prompt in one language and asks for the equivalent in another. The prompt can be a word, phrase, or sentence. Source and target languages vary randomly among studied languages.

**Recognition practice** presents options and asks the learner to identify the correct one. This tests passive knowledge.

**Production practice** requires the learner to produce language from memory. This includes typing, but also audio recording where the learner speaks and can compare their pronunciation to a reference.

**Cloze exercises** present a sentence with a missing element. The learner fills the gap based on context and grammar knowledge.

**Dictation** plays audio and asks the learner to transcribe what they hear. This tests listening comprehension and orthography.

**Reading comprehension** presents a text and asks questions about its content. Texts are chosen to match the learner's current level.

**Translation** works between studied languages, not from or to the base language (except for initial introduction of new concepts). Seeing a sentence in Italian and translating to Portuguese trains direct associations without the base language as intermediary.

### 9.7 Spaced Repetition

The system schedules review of learned material using spaced repetition. Items due for review appear automatically in the daily study session.

The scheduling algorithm considers difficulty, time since last review, and learner performance history. Items the learner struggles with appear more frequently. Items the learner knows well appear less frequently.

Review is not limited to vocabulary. Grammar rules, example sentences, and other content types also enter the review queue.

### 9.8 Parallel Learning

This is the core differentiator of PolyLadder. The goal is to leverage similarities between languages and train the brain to switch fluently.

When studying related languages like Spanish, Italian, and Portuguese, the system presents grammar and vocabulary comparatively. A lesson on past tense shows how each language forms it, what is similar, and what differs. This explicit comparison accelerates learning and reduces confusion.

Exercises deliberately mix languages. A practice session might ask for translation from Italian to Spanish, then from Portuguese to Italian, then from Spanish to Portuguese. This randomization prevents the learner from creating fixed pathways through the base language.

The system detects interference patterns. When a learner consistently confuses similar words or structures across languages, the system generates targeted exercises to address the specific confusion.

Focus mode is available when the learner needs to consolidate one language without interference. This is useful for exam preparation or when confusion becomes too high. But the default mode is parallel.

### 9.9 Progress Tracking

The system provides detailed progress information.

**Vocabulary count** shows how many words the learner knows in each language, with breakdown by domain and frequency band.

**Grammar coverage** shows which grammar topics have been completed and which remain.

**Level assessment** maps the learner's current abilities to CEFR levels. This is based on vocabulary size, grammar coverage, and exercise performance.

**Weakness identification** highlights specific areas where the learner struggles. This might be a grammar rule, a vocabulary domain, or a language pair that causes confusion.

**Study statistics** show time spent, exercises completed, and trends over time. This helps the learner understand their own learning patterns.

================================================================

## 10. Supported Languages

The initial set of supported languages includes five languages.

1. English, specifically the US standard
2. Italian, the standard form
3. Portuguese, specifically the Portugal standard (not Brazilian)
4. Slovenian, the standard form
5. Spanish, specifically the Spain standard (not Latin American)

The architecture allows adding new languages at any time. Adding a language means defining its standard, creating orthography and phonetics data, and populating meanings and utterances through the same pipeline as existing languages. New languages integrate with the curriculum graph and can participate in parallel learning with related languages.

When languages are displayed together, they follow alphabetical order by language code.

For each language, orthography and phonetics are mandatory prerequisites. A learner cannot access vocabulary, grammar, or exercises for a language until they complete the orthography gate.

================================================================

## 11. System Growth Model

The system grows along two dimensions.

Knowledge depth increases through continuous addition of approved data. The base gets richer over time with more meanings, more utterances, more exercises, and more detailed grammar explanations. This growth happens through enrichment, never through mutation of existing data.

Learning experience improves through incremental addition of features. Each new feature delivers independent value. Features build on each other but can be released separately.

Quality must improve monotonically. As the system grows, learning should get better, never worse. This is guaranteed by the immutability rules and quality gates.

================================================================

## 12. Non-Goals

Some things are explicitly out of scope.

Social features like leaderboards, sharing, or community are not part of this system. Learning is a personal activity here.

Basic gamification is included to support motivation. This means streaks, progress indicators, and simple achievements. Complex mechanics like leaderboards, virtual currencies, or competitive elements are not included.

Marketing and monetization logic are not part of the system. If commercialization happens later, it will be a separate layer.

Third-party integrations unrelated to learning are not supported. The system is self-contained.

================================================================

## 13. Success Criteria

The system is successful if several conditions are met.

Approved data grows continuously. The knowledge base gets richer over time without stagnation.

Data quality never degrades. Every approved item maintains its correctness indefinitely.

Learning efficiency improves over time. As the system grows, learners achieve results faster and retain more.

Parallel learning provides measurable benefit. Learners who study related languages together perform better than those who study separately.

Product development follows incremental best practices. Features are delivered steadily, each one adding value.

================================================================

END OF TECHNICAL SPECIFICATION
